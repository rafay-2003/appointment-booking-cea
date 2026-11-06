# BookEase — AWS Restart Guide

**Region:** `eu-north-1` (Stockholm)  
**Restart order:** RDS → EC2 → Docker/API → ALB → Website

## 1. Start PostgreSQL (RDS)

1. Open [RDS Databases](https://eu-north-1.console.aws.amazon.com/rds/home?region=eu-north-1#databases:).
2. Select **`cea-postgres`**.
3. If **Stopped**, choose **Actions → Start**. If already **Available**, do nothing.
4. Wait until its status is **Available**.

## 2. Start EC2

1. Open [EC2 Instances](https://eu-north-1.console.aws.amazon.com/ec2/home?region=eu-north-1#Instances:).
2. Select **`cea-bookease-ec2`** → **Instance state → Start instance** (if stopped).
3. Confirm **Running** and **2/2 status checks passed**.

## 3. Verify Docker and the Database API

In EC2, select **Connect → Session Manager → Connect**, then run:

```bash
sudo docker ps
curl -i --max-time 15 http://127.0.0.1/api/appointments
```

- Both **`cea-nginx-web`** and **`cea-flask-app`** should be **Up**.
- The API should return **HTTP 200** with saved appointments. This also checks Flask–RDS access.
- If containers are not running, try:

```bash
sudo docker compose -f /opt/bookease/compose.yaml up -d
sudo docker ps
```

## 4. Check ALB Target Health

1. Open [EC2 Target Groups](https://eu-north-1.console.aws.amazon.com/ec2/home?region=eu-north-1#TargetGroups:).
2. Select **`cea-bookease-tg`** → **Targets**.
3. Confirm **`cea-bookease-ec2`** is **Healthy** (health endpoint: `/api/health`). Allow time for checks after startup.

## 5. Open BookEase

1. Open [EC2 Load Balancers](https://eu-north-1.console.aws.amazon.com/ec2/home?region=eu-north-1#LoadBalancers:).
2. Select **`cea-bookease-alb`** → **Details** → copy **DNS name**.
3. In your browser, open **`http://<ALB-DNS-NAME>`** (**HTTP**, not HTTPS).
4. Confirm the dashboard and previously saved appointments appear.

## When Finished for the Day

- Close Session Manager with `exit`.
- To reduce costs, **stop EC2 first, then temporarily stop RDS** (data/EBS storage is preserved).
- **ALB cannot be stopped** and continues incurring charges while it exists; do **not** delete it unless you're ready to recreate it.
- Never **Terminate** EC2 or **Delete** RDS when you only mean to stop them.

**Next project task:** Step 11B — GitHub OIDC setup.
