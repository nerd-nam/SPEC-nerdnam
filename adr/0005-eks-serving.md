# ADR-0005: EKS 서빙 구성 (k8s · Karpenter · Terraform)

- 상태: **결정** (남은 결정 D-11 확정, 2026-10-23. 아래 "구축 전에 확인할 것"은 구축하며 측정)
- 날짜: 2026-10-23
- 담당: AI (인프라), BE 리뷰 필요
- 관련: ADR-0001(모델·GPU 선택), 기획서 5.3·5.5 "GPU 서버 실행", 작업목록 D-4 · D-11 · AI-15

## 배경

- ADR-0001은 "EC2 GPU 1대에 docker compose로 vLLM과 AI 서버를 띄우고, 쓸 때만 켠다"까지 정했다.
- 인프라는 **Kubernetes(EKS)** 와 **Terraform**으로 만들기로 했다. 모델·GPU 종류(Qwen3.5-4B, embeddinggemma-2, g4dn.xlarge T4)는 ADR-0001 그대로이고, 이 문서는 **어디서·어떻게 띄우고 켜고 끄는지**를 정한다.

## 결정

### 1. 전체 구성

```text
AWS 서울(ap-northeast-2)
└─ VPC — 퍼블릭 서브넷 2개(AZ a, c), NAT 없음 (ADR-0001)
   └─ EKS 클러스터 nerdnam
      ├─ 관리형 노드 그룹 system: t3.large 1대 (상시) — Karpenter, CoreDNS, API 서버(BE), Redis(Pod 1개)
      └─ Karpenter NodePool gpu: g4dn.xlarge 0~1대 (AZ a 고정, 온디맨드)
           └─ namespace nerdnam / Deployment ai (replicas 0 = 꺼짐, 1 = 켜짐)
               ├─ vllm : 네이티브 사이드카, Pod 안에서만 (localhost:8001)
               ├─ ai   : FastAPI + 임베딩, :8000 ← Service ai (BE만 접근)
               └─ PVC hf-cache (EBS gp3 50Gi, 모델 가중치 보관)
   ECR: nerdnam-ai, nerdnam-api · S3: Terraform state
```

| 도구 | 맡는 것 |
| --- | --- |
| **EKS** | AWS가 관리하는 Kubernetes. 컨트롤 플레인은 AWS가 운영 |
| **Karpenter** | 필요한 노드(서버)를 자동으로 만들고 지움. AI Pod가 뜨면 GPU 노드를 만들고, 비면 지움 |
| **ECR** | 컨테이너 이미지 저장소. GitHub Actions가 빌드해 올리고, k8s가 받아 실행 |
| **Terraform** | VPC·EKS·IAM·ECR 같은 AWS 리소스와 클러스터 기본 도구(Helm)를 코드로 관리 |

### 2. AI Pod: 한 Pod에 컨테이너 두 개

| 결정 | 이유 |
| --- | --- |
| vLLM과 AI 서버를 **한 Pod의 다른 컨테이너**로 둔다 | T4 한 장을 같이 쓴다(두 모델 13.9GB, ADR-0001). transformers 버전이 충돌해 한 컨테이너에 넣을 수 없다. 같은 Pod라 `localhost`로 부르고 vLLM을 밖에 열 필요가 없다 |
| **GPU time-slicing** (NVIDIA device plugin, replicas 2) | k8s는 기본적으로 GPU 1장을 컨테이너 하나에만 준다. time-slicing으로 두 컨테이너가 각각 `nvidia.com/gpu: 1`을 받는다. 메모리는 나눠 주지 않으므로 지금처럼 vLLM `--gpu-memory-utilization 0.80` + 임베딩 나머지로 나눈다 |
| vLLM을 **네이티브 사이드카**(`initContainers` + `restartPolicy: Always` + `startupProbe`)로 둔다 | vLLM의 startupProbe가 통과해야 AI 서버가 시작한다. vLLM이 GPU 메모리를 먼저 잡아야 하는 순서 규칙(ADR-0001)을 compose의 `depends_on: healthy`와 같은 방식으로 지킨다 |
| vLLM 포트를 **8001**로 | 같은 Pod의 컨테이너는 포트를 나눠 쓴다. AI 서버는 8000, `VLLM_URL=http://localhost:8001` |
| 배포 방식 `Recreate` | GPU가 1장이라 새 Pod와 옛 Pod를 동시에 띄울 수 없다 |
| 프로브: vLLM `startupProbe` 최대 15분, AI 서버 readiness는 `/health` 200만 확인 | 모델 상태(`loading`/`ready`)는 `/health` 응답 내용으로 BE에 알린다(기획서 5.5). readiness로 막으면 BE가 "로딩 중"과 "꺼짐"을 구분할 수 없다 |
| 모델 가중치는 **EBS PVC**(hf-cache)에 둔다 | 켤 때마다 약 10GB를 다시 받지 않는다. EBS는 AZ 하나에만 붙으므로 GPU NodePool을 그 AZ로 고정한다 |
| `HF_TOKEN`은 Secret으로 | embeddinggemma-2는 Hugging Face에서 사용 동의가 필요한 모델이다 |

### 3. 켜고 끄기

```text
켜기: kubectl scale deploy/ai -n nerdnam --replicas=1
  → Pod 대기 → Karpenter가 GPU 노드 생성(2~3분) → vLLM 시작·준비 → AI 서버 시작·임베딩 로딩
  → /health 모두 ready (첫 실행 최대 15분, 이후 5~10분 예상 — 실측 후 갱신)
끄기: replicas 0 (수동, 또는 CronJob이 매일 정해진 시간에)
  → 노드가 비면 Karpenter가 지움(consolidationPolicy: WhenEmpty) → GPU 비용 0
```

- 꺼져 있는 동안 BE는 연결 실패를 `GPU_UNAVAILABLE`로 처리한다(기획서 5.5, 변경 없음).
- GPU NodePool에 `limits nvidia.com/gpu: 1`을 걸어 GPU 노드가 2대 이상 뜨지 않게 한다.

### 4. 네트워크·보안

- AI 서버는 클러스터 안 주소 `http://ai.nerdnam.svc:8000`만 있다(ClusterIP). 인터넷에 열지 않는다.
- **NetworkPolicy**(VPC CNI의 network policy 기능 사용): `ai` Pod는 라벨 `app: api`인 Pod의 8000 포트 요청만 받는다.
- 노드는 퍼블릭 서브넷에 두되 보안 그룹에서 외부 인바운드를 막는다. 이미지·모델 다운로드만 밖으로 나간다(NAT 비용 없음, ADR-0001).
- EKS API 엔드포인트는 팀원 IP만 허용한다. 이미지 빌드·배포는 GitHub Actions OIDC로 한다(Access Key를 저장하지 않음).

### 5. 코드 위치와 구성

```text
nerdnam-infra 레포 (D-11)
├── bootstrap/      # 1회: Terraform state용 S3 버킷 (backend는 use_lockfile, DynamoDB 없음)
├── 10-cluster/     # VPC, EKS + system 노드 그룹, Karpenter IAM, 애드온(vpc-cni·coredns·kube-proxy·pod-identity·ebs-csi), ECR
├── 20-platform/    # Helm: Karpenter, NVIDIA device plugin(time-slicing)
├── k8s/            # NodePool·EC2NodeClass(gpu), StorageClass gp3 — CRD가 먼저 있어야 해서 kubectl로 적용
└── apps/           # 앱 배포 (kustomize), namespace nerdnam
    ├── ai/         # deployment(vllm 사이드카 + ai), service, pvc, networkpolicy, schedule(정해진 시간에 replicas 0, CronJob + RBAC), secret.example
    ├── api/        # deployment(라벨 app: api), service, 외부 공개(Ingress·로드밸런서는 구축 때 정함)
    └── redis/      # deployment 1개, service redis.nerdnam.svc:6379. 영속 볼륨 없음
```

- 클러스터를 BE·AI가 같이 쓰므로 인프라와 배포 설정을 서버 레포가 아닌 별도 레포 한 곳에 둔다. 서버 레포는 이미지를 ECR에 올리기까지만 한다.

- Terraform state를 클러스터(10)와 그 안의 Helm 설치(20)로 나눈다. 한 번에 적용하면 클러스터를 지우거나 교체할 때 provider 설정이 꼬이기 쉽다.
- 공개 Terraform 모듈(`terraform-aws-modules/vpc`, `terraform-aws-modules/eks`, `eks//modules/karpenter`)을 쓰고 직접 모듈은 만들지 않는다.
- docker compose(AI 레포)는 GPU 서버 한 대에서 시험할 때 그대로 쓴다.
- **Redis는 클러스터 안 Pod 1개**로 둔다(추가 비용 없음). 재시작하면 세션·캐시가 사라져 사용자는 다시 로그인한다. 클로즈드 베타에서는 감수하고, 문제가 되면 ElastiCache(cache.t4g.micro, 월 약 $12)로 옮긴다.

## 비용 (대략, 서울 리전. 구축 전에 다시 확인)

| 항목 | 월 비용 |
| --- | --- |
| EKS 컨트롤 플레인 | 약 $73 (상시) |
| system 노드 t3.large 1대 | 약 $70 (상시) |
| GPU g4dn.xlarge | 켠 시간만, 시간당 약 $0.6~0.7 (하루 8시간 × 22일이면 약 $120) |
| EBS (PVC 50Gi, 노드 루트 디스크) | 약 $10 |
| 퍼블릭 IPv4 | IP 1개당 약 $3.6 |

ADR-0001(EC2 1대)보다 **상시 비용이 월 약 $140 늘어난다**(컨트롤 플레인 + system 노드). 대신 API 서버·Redis도 같은 클러스터에서 운영하고, GPU 켜고 끄기를 Pod 개수로 다룰 수 있다.

## 검토한 다른 방법

| 방법 | 채택하지 않은 이유 |
| --- | --- |
| EC2 1대 + docker compose (ADR-0001) | 가장 싸고 단순하다. 다만 팀이 EKS·Terraform으로 운영하기로 해서, 시험용으로만 남긴다 |
| vLLM과 AI 서버를 다른 Deployment로 | 각각 재시작할 수 있지만 시작 순서를 지키기 어렵고 vLLM을 Service로 열어야 한다 |
| GPU를 vLLM만 요청하고 AI 서버는 `NVIDIA_VISIBLE_DEVICES=all` | 설정은 적지만 스케줄러가 GPU 사용을 모르는 우회 방법이다 |
| EKS Auto Mode | Karpenter·EBS CSI·GPU 드라이버를 AWS가 관리해 편하지만, 인스턴스 요금에 관리 수수료가 붙고 time-slicing 설정을 직접 바꿀 수 있는지 확인되지 않았다 |
| NAT Gateway + 프라이빗 서브넷 | 더 안전하지만 상시 비용이 든다(ADR-0001 "NAT 만들지 않음") |

## 영향

- **BE**
  - API 서버도 같은 클러스터(system 노드)에서 운영한다. 배포 설정은 `nerdnam-infra` `apps/api/`.
  - AI 서버 주소: `http://ai.nerdnam.svc:8000`. Redis 주소: `redis.nerdnam.svc:6379`.
  - API 서버 Pod에 라벨 `app: api`를 붙여야 AI 서버에 접근할 수 있다 (NetworkPolicy).
  - 오류·재시도·타임아웃 규칙은 바뀌지 않는다 (기획서 5.5).
- **FE:** 영향 없음.
- **AI:** compose와 같은 실행 설정을 `nerdnam-infra` `apps/ai/`로 옮긴다. vLLM 포트만 8001로 바뀐다(`VLLM_URL` 환경변수, 코드 변경 없음).

## 구축 전에 확인할 것

- [ ] EKS AL2023 NVIDIA AMI의 드라이버가 580 이상인지 (vLLM 0.32 이미지 cu130에 필요, Kaggle은 580).
- [ ] time-slicing에서 두 컨테이너의 VRAM·응답 시간이 compose와 같은지 (AI 레포 `evals/load_test.py`).
- [ ] 켜는 데 걸리는 시간: 첫 실행, 캐시가 있을 때 → 기획서 5.5 "최대 15분" 갱신.

## 남은 결정 (D-11)

- [x] API 서버(BE)도 같은 EKS 클러스터에 올리는지 → **같은 클러스터** (2026-10-23). 내부 로드밸런서가 필요 없고 4절 그대로다.
- [x] `infra/` 코드 위치 → **별도 레포 `nerdnam-infra`** (2026-10-23). Terraform과 앱 배포 설정(`apps/ai`·`apps/api`·`apps/redis`)을 모두 둔다.
- [x] (함께) Redis 위치 → **클러스터 안 Pod 1개** (2026-10-23). 5절 참고.
