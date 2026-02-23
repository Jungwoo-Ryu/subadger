# Subadger API - AI Coding Guidelines

## Project Overview
This is a FastAPI-based REST API service ("Subadger API") that integrates with Supabase for backend services. The application is containerized using Docker and orchestrated with docker-compose.

## Architecture
- **Main Application**: `app/main.py` - FastAPI app instance with endpoints
- **Dependencies**: `app/requirements.txt` - FastAPI, uvicorn, python-dotenv, supabase
- **Containerization**: Dockerfile builds Python 3.12-slim image, runs uvicorn on port 8000
- **Orchestration**: docker-compose.yml uses pre-built image `thugken/subadger:latest`, loads `.env` file

## Key Patterns
- **API Structure**: Use single FastAPI instance (`app = FastAPI()`) in `main.py`
- **Endpoints**: Follow REST conventions, e.g., `@app.get("/")` for root health check
- **Supabase Integration**: Import and use supabase client for database operations (not yet implemented in current endpoints)
- **Environment**: Load config from `.env` file using python-dotenv

## Development Workflow
- **Local Development**: Run `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- **Containerized Development**: `docker-compose up --build` (rebuilds image if Dockerfile changed)
- **Production**: `docker-compose up` (uses pre-built image)
- **Health Checks**: GET `/` returns status, GET `/health` returns health status

## Code Organization
- Keep application code in `app/` directory
- `main.py` as entry point with FastAPI app definition
- Add new endpoints directly in `main.py` or import from modules within `app/`
- Update `requirements.txt` for new dependencies

## Deployment
- Build image: `docker build -t thugken/subadger .`
- Push to registry, then `docker-compose up` pulls and runs latest image
- Environment variables in `.env` file (not committed to git)

## Examples
- **Adding Endpoint**: 
  ```python
  @app.get("/users")
  def get_users():
      # Use supabase client here
      return {"users": []}
  ```
- **Using Supabase**:
  ```python
  from supabase import create_client
  supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
  ```

## Important Notes
- Current implementation is minimal (only health endpoints)
- Supabase client setup needed for data operations
- All environment config via `.env` file</content>
<parameter name="filePath">/Users/wassabik/subadger/.github/copilot-instructions.md