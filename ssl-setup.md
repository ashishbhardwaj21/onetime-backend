#!/bin/bash

# OneTime Dating App - SSL Certificate Setup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Configuration
DOMAIN="api.onetime.app"
EMAIL="admin@onetime.app"
SSL_DIR="/etc/ssl/onetime"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

log_info "OneTime Dating App - SSL Certificate Setup"
log_info "==========================================="

# Detect OS
if [ -f /etc/debian_version ]; then
    OS="debian"
elif [ -f /etc/redhat-release ]; then
    OS="redhat"
else
    log_error "Unsupported operating system"
    exit 1
fi

log_info "Detected OS: $OS"

# Function to install certbot
install_certbot() {
    log_step "Installing Certbot..."
    
    if [ "$OS" = "debian" ]; then
        apt update
        apt install -y snapd
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
    elif [ "$OS" = "redhat" ]; then
        yum install -y epel-release
        yum install -y certbot python3-certbot-nginx
    fi
    
    log_info "Certbot installed successfully"
}

# Function to setup Let's Encrypt
setup_letsencrypt() {
    log_step "Setting up Let's Encrypt SSL certificate..."
    
    # Check if nginx is running
    if ! systemctl is-active --quiet nginx; then
        log_warn "Nginx is not running. Starting nginx..."
        systemctl start nginx
    fi
    
    # Obtain certificate
    log_info "Obtaining SSL certificate for $DOMAIN..."
    certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
    
    if [ $? -eq 0 ]; then
        log_info "SSL certificate obtained successfully"
    else
        log_error "Failed to obtain SSL certificate"
        exit 1
    fi
}

# Function to setup auto-renewal
setup_auto_renewal() {
    log_step "Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /usr/local/bin/renew-ssl.sh << 'EOF'
#!/bin/bash
/usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"
EOF
    
    chmod +x /usr/local/bin/renew-ssl.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/local/bin/renew-ssl.sh") | crontab -
    
    log_info "Auto-renewal configured"
    
    # Test renewal
    log_info "Testing certificate renewal..."
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        log_info "Certificate renewal test passed"
    else
        log_warn "Certificate renewal test failed"
    fi
}

# Function to create self-signed certificate (for development)
create_self_signed() {
    log_step "Creating self-signed SSL certificate for development..."
    
    mkdir -p "$SSL_DIR"
    
    # Generate private key
    openssl genrsa -out "$SSL_DIR/onetime.key" 2048
    
    # Generate certificate
    openssl req -new -x509 -key "$SSL_DIR/onetime.key" -out "$SSL_DIR/onetime.crt" -days 365 -subj "/C=US/ST=CA/L=San Francisco/O=OneTime Dating App/OU=Development/CN=$DOMAIN"
    
    # Set permissions
    chmod 600 "$SSL_DIR/onetime.key"
    chmod 644 "$SSL_DIR/onetime.crt"
    
    log_info "Self-signed certificate created at $SSL_DIR"
}

# Function to configure nginx for SSL
configure_nginx_ssl() {
    log_step "Configuring Nginx for SSL..."
    
    # Backup existing configuration
    if [ -f /etc/nginx/sites-available/default ]; then
        cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup
    fi
    
    # Create SSL configuration
    cat > /etc/nginx/sites-available/onetime-ssl << EOF
# OneTime Dating App - SSL Configuration
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL Configuration
    ssl_certificate $SSL_DIR/onetime.crt;
    ssl_certificate_key $SSL_DIR/onetime.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    # Enable the configuration
    ln -sf /etc/nginx/sites-available/onetime-ssl /etc/nginx/sites-enabled/
    
    # Test nginx configuration
    nginx -t
    
    if [ $? -eq 0 ]; then
        log_info "Nginx configuration is valid"
        systemctl reload nginx
        log_info "Nginx reloaded with SSL configuration"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
}

# Function to test SSL configuration
test_ssl() {
    log_step "Testing SSL configuration..."
    
    # Wait for nginx to reload
    sleep 2
    
    # Test HTTPS connection
    if curl -sSf https://"$DOMAIN"/health > /dev/null 2>&1; then
        log_info "HTTPS connection test passed"
    else
        log_warn "HTTPS connection test failed - this may be expected if the app is not running"
    fi
    
    # Check SSL certificate
    log_info "SSL Certificate Information:"
    echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null | openssl x509 -noout -dates
}

# Function to show firewall configuration
configure_firewall() {
    log_step "Configuring firewall..."
    
    # Check if ufw is available
    if command -v ufw > /dev/null; then
        ufw allow 80/tcp
        ufw allow 443/tcp
        log_info "UFW firewall configured for HTTP and HTTPS"
    elif command -v firewall-cmd > /dev/null; then
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
        log_info "Firewalld configured for HTTP and HTTPS"
    else
        log_warn "No firewall detected. Ensure ports 80 and 443 are open"
    fi
}

# Main execution
main() {
    log_info "Starting SSL setup for domain: $DOMAIN"
    
    # Ask user for setup type
    echo
    echo "Choose SSL setup type:"
    echo "1) Let's Encrypt (Free, automatic renewal) - Production"
    echo "2) Self-signed certificate - Development/Testing"
    echo "3) Manual configuration - I'll provide my own certificates"
    echo
    read -p "Enter choice (1-3): " choice
    
    case $choice in
        1)
            log_info "Setting up Let's Encrypt SSL..."
            install_certbot
            setup_letsencrypt
            setup_auto_renewal
            ;;
        2)
            log_info "Creating self-signed certificate..."
            create_self_signed
            configure_nginx_ssl
            ;;
        3)
            log_info "Manual configuration selected"
            log_info "Please place your certificate at: $SSL_DIR/onetime.crt"
            log_info "Please place your private key at: $SSL_DIR/onetime.key"
            read -p "Press enter when certificates are in place..."
            configure_nginx_ssl
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Configure firewall
    configure_firewall
    
    # Test SSL
    test_ssl
    
    log_info "SSL setup completed successfully!"
    log_info "Your site should now be accessible at: https://$DOMAIN"
    
    if [ "$choice" = "1" ]; then
        log_info "Let's Encrypt certificate will auto-renew every 60 days"
    fi
    
    # Show next steps
    echo
    log_info "Next steps:"
    echo "1. Update your application's environment variables with HTTPS URLs"
    echo "2. Test your application thoroughly with HTTPS"
    echo "3. Update any hardcoded HTTP URLs to HTTPS"
    echo "4. Configure HSTS headers for additional security"
    echo "5. Test SSL configuration at: https://www.ssllabs.com/ssltest/"
}

# Run main function
main "$@"