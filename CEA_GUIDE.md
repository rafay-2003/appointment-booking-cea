# BookEase CEA — Quick Project Guide

**Course:** Cloud Computing (SE-490) · **Project:** BookEase Appointment Booking System  
**Group:** 19 · **AWS Region:** `eu-north-1` (Stockholm)  
**Source code:** https://github.com/rafay-2003/appointment-booking-cea

## 1. What we built

We designed and deployed a **three-tier appointment-booking web application** on Amazon Web Services (AWS). Users can book appointments, view bookings, and check occupied time slots. The application runs in Docker containers on EC2, stores data in a private PostgreSQL database, and is reached through an Application Load Balancer (ALB).

| Tier | Technology / AWS service | Why we used it |
|---|---|---|
| Presentation | HTML/CSS/JavaScript served by **Nginx** in Docker | Provides the booking interface; Nginx forwards `/api/` requests to Flask. |
| Application | **Flask** + Gunicorn in Docker on **Amazon EC2** | Handles booking APIs, validation, and database operations. |
| Database | **Amazon RDS for PostgreSQL** | Managed, persistent storage for appointments, separate from application containers. |

## 2. Network and security design

- **VPC `cea-vpc` (`10.0.0.0/16`)** separates project resources from other AWS networks.
- **Two public subnets** (`cea-public-1`, `cea-public-2`) across two Availability Zones host the internet-facing ALB; the running EC2 instance is in `cea-public-1`.
- **Two private subnets** (`cea-private-1`, `cea-private-2`) form the RDS subnet group. The database has **no public access**.
- **Internet Gateway + public routing** provide internet access to public resources; private subnets have no direct internet route, so no NAT gateway was needed for this design.
- **Security groups restrict traffic:** internet → ALB on HTTP 80 (`cea-alb-sg`); ALB → EC2 on HTTP 80 (`cea-ec2-sg`); EC2 → RDS on PostgreSQL 5432 (`cea-db-sg`). Flask port 5000 is internal to the Docker network.
- **IAM role `cea-ec2-role`** supplies temporary permissions to pull ECR images, use Systems Manager, and read one password parameter. **Session Manager** provides shell access without inbound SSH.
- **Parameter Store SecureString** (`/cea/bookease/db-password`) keeps the RDS password out of source code and container images. EC2 stores a root-restricted environment file; the database connection requires TLS (`sslmode=require`).

> **Known limitation:** The public ALB listener currently uses **HTTP**, not HTTPS. Only fictional demonstration data should be entered until HTTPS is configured.

## 3. Containers and deployment

- The project has separate Dockerfiles for the **Nginx frontend** and **Flask backend**.
- **Docker Compose** connects the two containers on an internal bridge network. Nginx exposes port 80; Flask listens internally on 5000.
- Docker images are stored in private **Amazon ECR** repositories: `cea-web` and `cea-app`.
- The live EC2 host is `cea-bookease-ec2`, behind ALB `cea-bookease-alb` and target group `cea-bookease-tg`, using health-check path `/api/health`.
- RDS instance `cea-postgres` hosts database `appointmentdb`. The `appointments` table was initialized on RDS after deployment.

**Request path:** Browser → ALB → Nginx → Flask API → private RDS PostgreSQL.

## 4. Automated CI/CD — why and how

**GitHub Actions** (`.github/workflows/deploy.yml`) automates repeatable deployments when changes are pushed to `main`:

1. Check out the repository and run the Flask health test.
2. Build frontend/backend Docker images and tag them with the **Git commit SHA** (traceable version).
3. Authenticate to AWS via **GitHub OIDC** and restricted IAM role `cea-github-deploy-role`—no long-lived root access keys in GitHub.
4. Push images to the two ECR repositories.
5. Trigger **AWS Systems Manager Run Command** on EC2; `/usr/local/bin/bookease-deploy` pulls the images and updates Docker Compose.
6. Verify a database-dependent endpoint (`/api/appointments`) returns successfully.

**Observed result:** GitHub Actions runs #1 and #2 succeeded; both running EC2 containers used commit tag `abd82dcf47ac3f2c3004b923d50ef6c046888a8c`.

## 5. Verification and tests

| Test | Observed result |
|---|---|
| Local Docker-based app | Frontend, Flask APIs and local PostgreSQL worked. |
| EC2 `/api/health` | HTTP 200. |
| EC2 `/api/appointments` and `/api/slots` | HTTP 200 after initializing the RDS table. |
| Create appointment | Test booking stored in RDS and returned by GET API. |
| Slot availability | Booked time `10:00` appeared under `booked_slots`. |
| ALB health check | EC2 target reported **Healthy**. |
| Public browser | BookEase loaded through ALB; bookings persisted after refresh. |
| Automated CI/CD | GitHub Actions runs succeeded, and updated images were running on EC2. |

## 6. Cloud-native enhancements and limitations

- **CloudWatch:** Alarm `cea-bookease-high-cpu` monitors EC2 CPU utilization, triggering above **70% for two consecutive five-minute periods**. A CPU metric graph was observed; alarm activation/notification was not deliberately tested.
- **Auto Scaling:** Launch template `cea-bookease-template` (v2) contains a bootstrap script in `infrastructure/asg-user-data.sh`; Auto Scaling Group `cea-bookease-asg` was configured with **minimum 0, desired 0, maximum 2**. A CPU target-tracking policy was configured. **The ASG is inactive and was not load-tested or verified to launch a healthy replacement instance.** The live service still runs on one separate EC2 instance; GitHub Actions deploys to that specific instance.
- **Other limitations:** Single active EC2 is a possible availability bottleneck; HTTPS, automatic secrets rotation, and ASG-aware CI/CD deployment would be useful production improvements.

## 7. Where the important files are

| File / folder | Purpose |
|---|---|
| `frontend/Dockerfile`, `backend/Dockerfile` | Container images for the two application tiers. |
| `docker-compose.yml` | Local multi-container setup. |
| `.github/workflows/deploy.yml` | Automated CI/CD pipeline. |
| `backend/tests/test_health_ci.py` | Automated health endpoint test. |
| `infrastructure/asg-user-data.sh` | Bootstrap instructions for prospective Auto Scaling EC2 instances. |
| `report/` | LaTeX technical report, architecture diagram and deployment screenshots. |
| `restart-guide.md` | How to start/stop RDS and EC2 and verify the deployed system. |

## 8. Why this meets the CEA goals

The design demonstrates **separation of concerns**, **managed persistent data**, **network isolation**, **restricted service permissions**, **containerized deployment**, **automated CI/CD**, **load-balanced entry**, **monitoring**, and a **configured (but untested) Auto Scaling foundation**. For non-functional requirements, these decisions support maintainability, portability, deployment repeatability, security, observability and performance monitoring; high availability and automatic scaling remain limited by the single active application instance.
