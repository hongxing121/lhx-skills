#!/bin/bash

# Shadowsocks-libev Setup Script for Ubuntu
# Usage: ./setup-shadowsocks.sh <password> [port] [method]
# Example: ./setup-shadowsocks.sh "NanNan1214" 8388 "aes-256-gcm"

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
PASSWORD="${1:-your_password_here}"
PORT="${2:-8388}"
METHOD="${3:-aes-256-gcm}"
TIMEOUT="300"

# Validate inputs
if [ -z "$PASSWORD" ] || [ "$PASSWORD" = "your_password_here" ]; then
    echo -e "${RED}Error: Password is required${NC}"
    echo "Usage: $0 <password> [port] [method]"
    exit 1
fi

echo -e "${YELLOW}=== Shadowsocks-libev Setup ===${NC}"
echo "Password: $PASSWORD"
echo "Port: $PORT"
echo "Encryption Method: $METHOD"
echo ""

# Step 1: Update system packages
echo -e "${YELLOW}[1/5] Updating system packages...${NC}"
sudo apt-get update -qq
echo -e "${GREEN}✓ System packages updated${NC}"

# Step 2: Install shadowsocks-libev
echo -e "${YELLOW}[2/5] Installing shadowsocks-libev...${NC}"
sudo apt-get install -y shadowsocks-libev > /dev/null 2>&1
echo -e "${GREEN}✓ shadowsocks-libev installed${NC}"

# Step 3: Create configuration file
echo -e "${YELLOW}[3/5] Creating configuration file...${NC}"
CONFIG_FILE="/etc/shadowsocks-libev/config.json"

sudo tee "$CONFIG_FILE" > /dev/null << EOF
{
    "server": "0.0.0.0",
    "server_port": $PORT,
    "password": "$PASSWORD",
    "timeout": $TIMEOUT,
    "method": "$METHOD",
    "mode": "tcp_and_udp",
    "fast_open": false,
    "dns_nameserver": ["8.8.8.8", "8.8.4.4"]
}
EOF

echo -e "${GREEN}✓ Configuration file created at $CONFIG_FILE${NC}"

# Step 4: Restart service
echo -e "${YELLOW}[4/5] Restarting shadowsocks-libev service...${NC}"
sudo systemctl restart shadowsocks-libev
sleep 2
echo -e "${GREEN}✓ Service restarted${NC}"

# Step 5: Verify service status
echo -e "${YELLOW}[5/5] Verifying service status...${NC}"
if sudo systemctl is-active --quiet shadowsocks-libev; then
    echo -e "${GREEN}✓ Service is running${NC}"
else
    echo -e "${RED}✗ Service failed to start${NC}"
    sudo systemctl status shadowsocks-libev
    exit 1
fi

# Verify port is listening
if sudo ss -tlnup | grep -q ":$PORT"; then
    echo -e "${GREEN}✓ Port $PORT is listening${NC}"
else
    echo -e "${RED}✗ Port $PORT is not listening${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Shadowrocket Configuration:"
echo "  Server: $(hostname -I | awk '{print $1}')"
echo "  Port: $PORT"
echo "  Password: $PASSWORD"
echo "  Encryption: $METHOD"
echo "  Protocol: Shadowsocks"
echo ""
echo "Service Management:"
echo "  Status: sudo systemctl status shadowsocks-libev"
echo "  Logs: sudo journalctl -u shadowsocks-libev -f"
echo "  Restart: sudo systemctl restart shadowsocks-libev"
echo ""
echo -e "${YELLOW}Important: Don't forget to open port $PORT in AWS Security Group!${NC}"
echo "  - Add inbound rule for TCP port $PORT"
echo "  - Add inbound rule for UDP port $PORT"
