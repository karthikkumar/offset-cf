# Offset CF (Carbon Footprint)

A platform for e-commerce stores to offer carbon footprint offset options to their customers during checkout. The system consists of three main components: a FastAPI backend, an offset estimation as a micro service and a JavaScript widget for store integration.

## 📁 Project Structure

```
offset-cf/
├── api/                        # FastAPI Backend Service
│   ├── app/                    # Application code
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── api.py              # API routes and endpoints
│   │   ├── models.py           # SQLAlchemy & Pydantic models
│   │   ├── database.py         # Database connection & session
│   │   ├── constants.py        # Default configurations
│   │   ├── utils.py            # Utility functions
│   │   └── requirements.txt    # Python dependencies
│   ├── db/                     # Database setup scripts
│   │   ├── setup_db.sql        # Main database schema
│   │   └── seed_db.sql         # Sample data
│   ├── Dockerfile              # Container configuration
│   └── deploy.sh               # AWS ECR deployment script
├── estimator/                  # AWS Lambda Function
│   └── lambda.py               # Carbon offset estimation logic
└── widget/                     # Shopify store widget
    ├── widget_v1_0_0.js        # Main widget script
    └── config_v1_0_0.json      # Default widget configuration
```

## 🚀 Core Components

### 1. FastAPI Backend (`/v1`)

**Purpose**: Central API service that manages merchant configurations, tracks customer opt-ins, and provides reporting capabilities.

**Key Features**:
- **Widget Configuration API**: Retrieves store-specific widget settings
- **Opt-in Tracking**: Records customer carbon offset preferences
- **Monthly Reporting**: Provides analytics on opt-ins and estimated offsets
- **Merchant Management**: Supports multiple store configurations

**API Endpoints**:
- `GET /v1/widget-config` - Get widget configuration by store or merchant ID
- `POST /v1/opt-ins` - Record customer opt-in events
- `GET /v1/merchant/{store}/monthly-summary` - Get monthly analytics
- `GET /health` - Health check endpoint

**Database Schema**:
- `merchants` - Store information and settings
- `widget_configs` - Widget appearance and behavior configuration
- `opt_ins` - Customer offset preferences and order data

### 2. Estimator (`/estimator`)

**Purpose**: Serverless function that calculates carbon offset amounts based on cart subtotals.

**Features**:
- Configurable offset rate (default: 2% of cart value)
- Multi-currency support

**Input**: `{ "subtotal": 100.00, "currency": "USD" }`
**Output**: `{ "estimated_offset": 2.000, "rate": 0.02, "currency": "USD", "estimator_version": "v0.1.0" }`

### 3. JavaScript Widget (`/widget`)

**Purpose**: Drop-in script that integrates with e-commerce stores to offer carbon offset options.

**Features**:
- Automatic cart detection and integration
- Configurable placement and styling
- Real-time offset estimation
- Opt-in tracking and analytics
- Shopify-compatible design patterns

**Integration**: Include script with data attributes for configuration:
```html
<script 
  src="widget_v1_0_0.js" 
  data-api-base="https://api.offsetcf.com"
  data-estimate-url="https://estimate.offsetcf.com"
  data-api-version="v1">
</script>
```

## 🛠️ Local Development

### Prerequisites

- Docker and Docker Compose
- Python 3.11+
- PostgreSQL (or use Docker)

### Quick Start with Docker

1. **Clone and navigate to the project**:
   ```bash
   cd offset-cf/api
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env.local  # if available, or create manually
   ```

3. **Set up environment variables**:
   ```bash
    # AWS Configuration (for deployment)
    AWS_PROFILE=default
    AWS_REGION=us-east-1
    REPO_NAME=offset-cf-api
    IMAGE_TAG=0.1

    # Database Configuration (for database connection)
    DB_URL=postgresql://postgres:postgres@host.docker.internal:5432/offsetcf
   ```

4. **Start the database**:
   ```bash
   psql -h localhost -U postgres -d offsetcf
   ```

5. **Initialize the database**:
   ```bash
   # Wait for database to be ready, then run:
   psql -h localhost -U postgres -d offsetcf -f db/setup_db.sql
   ```

6. **Run the FastAPI service**:
   ```bash
   # Using Docker
   docker build -t offset-cf-api:local .
   docker run -p 8000:8000 --env-file .env.local --name offset-cf-local offset-cf-api:local
   
   # Or locally with Python
   cd app
   pip install -r requirements.txt
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

7. **Test the API**:
   ```bash
   curl http://localhost:8000/docs  # Swagger UI
   ```

## 🚀 Deployment

### AWS ECR Deployment

The project includes a deployment script for AWS ECR:

```bash
cd api
./deploy.sh -r us-east-1 -n offset-cf-api -t 1.0 -p your-aws-profile
```

**Script Features**:
- Automatic ECR repository creation
- AWS profile support
- Environment variable loading from `.env.local`
- Image tagging and pushing

**Required AWS Permissions**:
- ECR: Create repository, push images

### Lambda Function Deployment

1. **Package the Lambda function**:
   ```bash
   cd estimate
   zip -r lambda.zip lambda.py
   ```

2. **Deploy via AWS CLI**:
   ```bash
   aws lambda create-function \
     --function-name offset-cf-estimator \
     --runtime python3.9 \
     --handler lambda.lambda_handler \
     --zip-file fileb://lambda.zip \
     --role arn:aws:iam::ACCOUNT:role/lambda-execution-role
   ```

3. **Set environment variables**:
   ```bash
   aws lambda update-function-configuration \
     --function-name offset-cf-estimator \
     --environment Variables='{RATE=0.02,DEFAULT_CURRENCY=USD,ESTIMATOR_VERSION=v0.0.1}'
   ```

## 📊 API Reference

### Widget Configuration
```http
GET /v1/widget-config?store=acme.myshopify.com
```

**Response**:
```json
{
  "placement": "#cart-footer",
  "verbiage": "to offset my carbon footprint",
  "theme": {"primary_color": "#4CAF50"},
  "insert_position": "before",
  "is_enabled": true
}
```

### Record Opt-in
```http
POST /v1/opt-ins
Content-Type: application/json

{
  "store": "acme.myshopify.com",
  "cart": {"subtotal": 100.00, "currency": "USD"},
  "estimated_offset": 2.000,
  "estimator_version": "v1.0.0",
  "session_id": "sess_123",
  "customer": {"id": "cust_456", "email": "user@example.com"},
  "order_ref": "order_789"
}
```

### Monthly Summary
```http
GET /v1/merchant/acme.myshopify.com/monthly-summary?month=2024-01
```

**Response**:
```json
{
  "store": "acme.myshopify.com",
  "month": "2024-01",
  "currency": "USD",
  "totals": {
    "opt_ins": 150,
    "estimated_offset": 300.50
  },
  "daily": [
    {"day": "2024-01-01", "opt_ins": 5, "estimated_offset": 10.25}
  ]
}
```

## 🔧 Configuration

### Environment Variables

**API Service**:
- `DB_URL` - PostgreSQL database URL

**Lambda Function**:
- `RATE` - Carbon offset rate (default: 0.02 = 2%)
- `DEFAULT_CURRENCY` - Default currency (default: USD)
- `ESTIMATOR_VERSION` - Version identifier
