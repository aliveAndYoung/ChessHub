# main python slim image 
FROM python:3.12-slim

# 1 ==>  (PYTHONDONTWRITEBYTECODE) does prevent python from creating .pyc files 
# which keeps the image cleaner
# 2 ==> (PYTHONUNBUFFERED) this flushes the python logs to the image logs immmediately with no waiting in buffer    
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# sets /app as the main working directory 
WORKDIR /app

#  copies the requirements.txt to the image's workdir
COPY requirements.txt .

# runs command while the build to 
# 1)  updates pip , 
# 2)  skips cahcing to keep the image leaner , 
# 3 , 4 )  makes a new group and a non-root user to run the app 
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && addgroup --system app \
    && adduser --system --ingroup app app

# copies the code from the local host to image
COPY app ./app

# gives the new user ownership to the code files 
RUN chown -R app:app /app

# switching to the non-root user
USER app

# does expose the port from inside the container 
# the mapping to the local host port is still to take place later 
EXPOSE 8000

# the default command to run when the  container starts 
# basically starting the app             
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]