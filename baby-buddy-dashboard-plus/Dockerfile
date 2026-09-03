ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

# The release archive contains the already compiled frontend. This keeps local
# Home Assistant builds independent of npm/Vite and their Node version matrix.
COPY frontend/dist/ /app/static/
RUN test -f /app/static/index.html

# Copy backend
COPY backend/ /app/backend/

# Copy run script
COPY run.sh /
# ZIP extraction on Windows can convert shell scripts to CRLF. Normalise inside
# the Linux image as a second line of defence before s6 executes the script.
RUN sed -i 's/\r$//' /run.sh && chmod a+x /run.sh

WORKDIR /app

CMD [ "/run.sh" ]
