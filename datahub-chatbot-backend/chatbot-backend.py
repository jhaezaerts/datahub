from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from typing import Optional
import base64
from dotenv import load_dotenv
import asyncio

# Load environment variables
load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:9002",    # DataHub frontend local access
        "http://127.0.0.1:9002",    # Alternative local access
        "http://0.0.0.0:9002",      # Docker network access
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security configuration
api_key_header = APIKeyHeader(name="x-api-key", auto_error=True)

# Environment variables
FRONTEND_API_TOKEN = os.getenv("FRONTEND_API_TOKEN")
LANGFLOW_API_ENDPOINT = os.getenv("LANGFLOW_API_ENDPOINT")
LANGFLOW_API_TOKEN = os.getenv("LANGFLOW_API_TOKEN")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY")
LANGFUSE_BASE_URL = os.getenv("LANGFUSE_BASE_URL")

# Request models
class ChatRequest(BaseModel):
    input_value: str
    output_type: str = "chat"
    input_type: str = "chat"
    session_id: str

class FeedbackRequest(BaseModel):
    traceId: str
    value: int
    name: str = "user_feedback"
    data_type: str = "BOOLEAN"
    comment: Optional[str] = None

async def verify_frontend_key(api_key: str = Security(api_key_header)):
    if api_key != FRONTEND_API_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

@app.post("/api/chat")
async def chat(
    request: ChatRequest,
    api_key: str = Depends(verify_frontend_key)
):
    max_retries = 5
    retry_delay = 1  # seconds

    try:
        async with httpx.AsyncClient() as client:
            # Implement retry logic for Langflow API
            langflow_response = None
            for attempt in range(max_retries):
                try:
                    # Make request to Langflow
                    response = await client.post(
                        LANGFLOW_API_ENDPOINT,
                        headers={
                            "x-api-key": LANGFLOW_API_TOKEN,
                            "Content-Type": "application/json"
                        },
                        json=request.model_dump(),
                        timeout=30.0
                    )
                    
                    response.raise_for_status()
                    langflow_response = response.json()
                    print(f"Langflow attempt {attempt + 1}: Success")
                    break  # Success, exit retry loop
                    
                except httpx.HTTPError as e:
                    print(f"Langflow attempt {attempt + 1} failed with error: {str(e)}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delay * (attempt + 1))
                        continue
                    raise  # Re-raise the last error if all retries failed
            
            if not langflow_response:
                raise HTTPException(status_code=500, detail="Failed to get response from Langflow after all retries")
            
            chat_response = langflow_response
            
            # Get the timestamp from the response
            timestamp = None
            if chat_response.get('outputs') and len(chat_response['outputs']) > 0:
                timestamp = chat_response['outputs'][0]['outputs'][0]['results']['message'].get('timestamp')
            
            if timestamp:
                # Implement retry logic for traces API
                for attempt in range(max_retries):
                    try:
                        # Fetch trace ID using the timestamp
                        traces_response = await client.get(
                            f"{LANGFUSE_BASE_URL}/api/public/traces",
                            headers={
                                "Authorization": f"Basic {base64.b64encode(f'{LANGFUSE_PUBLIC_KEY}:{LANGFUSE_SECRET_KEY}'.encode()).decode()}",
                                "Content-Type": "application/json"
                            },
                            params={
                                "limit": 1,
                                "orderBy": "timestamp.desc",
                                "fromTimestamp": timestamp
                            },
                            timeout=10.0
                        )
                        
                        traces_response.raise_for_status()
                        traces_data = traces_response.json()
                        
                        # Check if we got valid trace data
                        if traces_data.get('data') and len(traces_data['data']) > 0:
                            chat_response['traceId'] = traces_data['data'][0]['id']
                            print(f"Langfuse attempt {attempt + 1}: Successfully got traceId")
                            break  # Success, exit retry loop
                        else:
                            print(f"Langfuse attempt {attempt + 1}: Empty trace data received")
                            if attempt < max_retries - 1:
                                await asyncio.sleep(retry_delay * (attempt + 1))
                            continue  # Try again if we have attempts left
                        
                    except (httpx.HTTPError, KeyError) as e:
                        print(f"Langfuse attempt {attempt + 1} failed with error: {str(e)}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(retry_delay * (attempt + 1))
                            continue
                        
                print(f"Final traceId status: {'found' if chat_response.get('traceId') else 'not found'}")
            
            return chat_response
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timed out")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/feedback")
async def submit_feedback(
    request: FeedbackRequest,
    api_key: str = Depends(verify_frontend_key)
):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{LANGFUSE_BASE_URL}/api/public/scores",
                headers={
                    "Authorization": f"Basic {base64.b64encode(f'{LANGFUSE_PUBLIC_KEY}:{LANGFUSE_SECRET_KEY}'.encode()).decode()}",
                    "Content-Type": "application/json"
                },
                json=request.model_dump()
            )
            
            response.raise_for_status()
            return response.json()
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}