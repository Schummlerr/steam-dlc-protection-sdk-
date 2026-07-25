# iMac Local Test Server Setup

## Install Node.js (macOS)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
```

## Start Test Server

```bash
cd local-test-server
cp .env.example .env
# Edit .env: set STEAM_WEB_API_KEY or MOCK_STEAM=true
npm install
npm start
```

## ngrok Tunnel (for Unity on Windows PC)

```bash
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken DEIN_NGROK_TOKEN
ngrok http 3000
```

Set Unity `verifyEndpointUrl` to: `https://XXXX.ngrok-free.app/verify-dlc`

## Health Check

```bash
curl http://localhost:3000/health
```
