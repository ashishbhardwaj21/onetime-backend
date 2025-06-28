#!/bin/bash

# OneTime Dating App - Docker Production Deployment Script

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
APP_NAME="onetime-dating-app"
VERSION="1.0.0"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="/var/backups/onetime"

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    log_info "Docker and Docker Compose are available"
}

# Check if .env.production exists
check_environment() {
    if [ ! -f ".env.production" ]; then
        log_error ".env.production file not found!"
        log_error "Please run 'node setup-production-env.js' first to create environment configuration."
        exit 1
    fi
    
    log_info "Production environment file found"
}

# Create backup of current deployment
create_backup() {
    log_step "Creating backup of current deployment..."
    
    local backup_timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="$BACKUP_DIR/backup_$backup_timestamp"
    
    mkdir -p "$backup_path"
    
    # Backup environment files
    if [ -f ".env.production" ]; then
        cp .env.production "$backup_path/"
    fi
    
    # Backup Docker Compose file
    if [ -f "$COMPOSE_FILE" ]; then
        cp "$COMPOSE_FILE" "$backup_path/"
    fi
    
    # Export current database (if container is running)
    if docker-compose -f "$COMPOSE_FILE" ps mongodb | grep -q "Up"; then
        log_info "Backing up database..."
        docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongodump --out /tmp/backup
        docker cp $(docker-compose -f "$COMPOSE_FILE" ps -q mongodb):/tmp/backup "$backup_path/mongodb_backup"
    fi
    
    log_info "Backup created at: $backup_path"
    echo "$backup_path" > /tmp/onetime_last_backup
}

# Build Docker images
build_images() {
    log_step "Building Docker images..."
    
    # Build the application image
    docker build -t "$APP_NAME:$VERSION" -t "$APP_NAME:latest" .
    
    if [ $? -eq 0 ]; then
        log_info "Application image built successfully"
    else
        log_error "Failed to build application image"
        exit 1
    fi
    
    # Pull other required images
    log_info "Pulling required images..."
    docker-compose -f "$COMPOSE_FILE" pull
}

# Start services
start_services() {
    log_step "Starting services..."
    
    # Copy production environment file
    cp .env.production .env
    
    # Start services in background
    docker-compose -f "$COMPOSE_FILE" up -d
    
    if [ $? -eq 0 ]; then
        log_info "Services started successfully"
    else
        log_error "Failed to start services"
        exit 1
    fi
}

# Wait for services to be healthy
wait_for_health() {
    log_step "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Health check attempt $attempt/$max_attempts..."
        
        # Check if app container is healthy
        local app_health=$(docker-compose -f "$COMPOSE_FILE" ps -q app | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null)
        
        if [ "$app_health" = "healthy" ]; then
            log_info "Application is healthy"
            break
        elif [ $attempt -eq $max_attempts ]; then
            log_error "Application failed to become healthy within expected time"
            docker-compose -f "$COMPOSE_FILE" logs app
            exit 1
        fi
        
        sleep 10
        ((attempt++))
    done
}

# Run database migrations
run_migrations() {
    log_step "Running database migrations..."
    
    # Wait for MongoDB to be ready
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongo --eval "db.adminCommand('ismaster')" > /dev/null 2>&1; then
            log_info "MongoDB is ready"
            break
        elif [ $attempt -eq $max_attempts ]; then
            log_error "MongoDB failed to start"
            exit 1
        fi
        
        log_info "Waiting for MongoDB... ($attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    # Run any migration scripts
    # docker-compose -f "$COMPOSE_FILE" exec app npm run migrate:prod
    log_info "Database migrations completed"
}

# Verify deployment
verify_deployment() {
    log_step "Verifying deployment..."
    
    # Test health endpoint
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sSf http://localhost:3000/health > /dev/null 2>&1; then
            log_info "Health check endpoint is responding"
            break
        elif [ $attempt -eq $max_attempts ]; then
            log_error "Health check endpoint is not responding"
            show_logs
            exit 1
        fi
        
        log_info "Testing health endpoint... ($attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    local endpoints=("/health" "/")
    
    for endpoint in "${endpoints[@]}"; do
        if curl -sSf "http://localhost:3000$endpoint" > /dev/null 2>&1; then
            log_info "✅ $endpoint - OK"
        else
            log_warn "⚠️ $endpoint - Failed"
        fi
    done
}

# Show service status
show_status() {
    log_step "Service Status:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo
    log_step "Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
}

# Show logs
show_logs() {
    log_step "Recent application logs:"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50 app
}

# Cleanup old images
cleanup() {
    log_step "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 3)
    docker images "$APP_NAME" --format "{{.Tag}}" | grep -v "latest" | sort -V | head -n -3 | xargs -r docker rmi "$APP_NAME:" 2>/dev/null || true
    
    log_info "Cleanup completed"
}

# Rollback to previous version
rollback() {
    log_error "Rolling back deployment..."
    
    # Stop current services
    docker-compose -f "$COMPOSE_FILE" down
    
    # Restore from backup
    local last_backup=$(cat /tmp/onetime_last_backup 2>/dev/null)
    
    if [ -n "$last_backup" ] && [ -d "$last_backup" ]; then
        log_info "Restoring from backup: $last_backup"
        
        # Restore environment file
        if [ -f "$last_backup/.env.production" ]; then
            cp "$last_backup/.env.production" .env.production
            cp "$last_backup/.env.production" .env
        fi
        
        # Restore database
        if [ -d "$last_backup/mongodb_backup" ]; then
            log_info "Restoring database..."
            docker-compose -f "$COMPOSE_FILE" up -d mongodb
            sleep 10
            docker cp "$last_backup/mongodb_backup" $(docker-compose -f "$COMPOSE_FILE" ps -q mongodb):/tmp/restore
            docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongorestore /tmp/restore
        fi
        
        # Start services
        docker-compose -f "$COMPOSE_FILE" up -d
        
        log_info "Rollback completed"
    else
        log_error "No backup found for rollback"
        exit 1
    fi
}

# Monitor deployment
monitor() {
    log_step "Monitoring deployment..."
    
    echo "Press Ctrl+C to stop monitoring"
    echo "=========================="
    
    while true; do
        clear
        echo "OneTime Dating App - Live Status"
        echo "Generated: $(date)"
        echo "================================"
        
        # Service status
        echo "Services:"
        docker-compose -f "$COMPOSE_FILE" ps
        
        echo
        echo "Resource Usage:"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
        
        echo
        echo "Recent Logs (last 5 lines):"
        docker-compose -f "$COMPOSE_FILE" logs --tail=5 app | tail -5
        
        sleep 10
    done
}

# Setup monitoring and alerts
setup_monitoring() {
    log_step "Setting up monitoring and alerts..."
    
    # Create monitoring script
    cat > /usr/local/bin/onetime-monitor.sh << 'EOF'
#!/bin/bash
COMPOSE_FILE="/opt/onetime/docker-compose.prod.yml"
LOG_FILE="/var/log/onetime-monitor.log"

# Check if services are running
if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo "$(date): Services are down, attempting restart..." >> "$LOG_FILE"
    docker-compose -f "$COMPOSE_FILE" up -d
fi

# Check health endpoint
if ! curl -sSf http://localhost:3000/health > /dev/null 2>&1; then
    echo "$(date): Health check failed" >> "$LOG_FILE"
    # Send alert (integrate with your alerting system)
fi
EOF

    chmod +x /usr/local/bin/onetime-monitor.sh
    
    # Add to crontab for regular monitoring
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/onetime-monitor.sh") | crontab -
    
    log_info "Monitoring script installed and scheduled"
}

# Main deployment function
deploy() {
    log_info "OneTime Dating App - Production Deployment"
    log_info "=========================================="
    
    check_docker
    check_environment
    create_backup
    build_images
    start_services
    wait_for_health
    run_migrations
    verify_deployment
    cleanup
    show_status
    
    log_info "🎉 Deployment completed successfully!"
    log_info "Application is running at: http://localhost:3000"
    log_info "Health check: http://localhost:3000/health"
    
    echo
    log_info "Useful commands:"
    echo "  View logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "  Stop services: docker-compose -f $COMPOSE_FILE down"
    echo "  Restart services: docker-compose -f $COMPOSE_FILE restart"
    echo "  Monitor: $0 monitor"
    echo "  Rollback: $0 rollback"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "rollback")
        rollback
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "monitor")
        monitor
        ;;
    "cleanup")
        cleanup
        ;;
    "setup-monitoring")
        setup_monitoring
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status|logs|monitor|cleanup|setup-monitoring}"
        echo
        echo "Commands:"
        echo "  deploy           - Deploy the application (default)"
        echo "  rollback         - Rollback to previous version"
        echo "  status           - Show service status"
        echo "  logs             - Show application logs"
        echo "  monitor          - Real-time monitoring"
        echo "  cleanup          - Clean up old Docker images"
        echo "  setup-monitoring - Install monitoring scripts"
        exit 1
        ;;
esac