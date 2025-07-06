/**
 * Cluster Manager
 * Handles multi-process scaling with worker management and load balancing
 */

const cluster = require('cluster');
const os = require('os');
const performanceConfig = require('../config/performance');
const logger = require('../utils/logger');

class ClusterManager {
  constructor() {
    this.workers = new Map();
    this.workerStats = new Map();
    this.restartCount = new Map();
    this.isShuttingDown = false;
    
    this.maxWorkers = performanceConfig.server.clustering.workers;
    this.maxRestarts = performanceConfig.server.clustering.maxRestarts;
    this.restartDelay = performanceConfig.server.clustering.restartDelay;
    
    this.initialize();
  }

  initialize() {
    if (!performanceConfig.server.clustering.enabled) {
      logger.info('Clustering disabled, running in single process mode');
      return;
    }

    if (cluster.isMaster) {
      this.setupMaster();
    } else {
      this.setupWorker();
    }
  }

  setupMaster() {
    const numCPUs = os.cpus().length;
    const workerCount = Math.min(this.maxWorkers, numCPUs);
    
    logger.info(`Master process ${process.pid} starting with ${workerCount} workers`);

    // Setup cluster settings
    cluster.setupMaster({
      exec: require.resolve('../server-production.js'),
      args: process.argv.slice(2),
      silent: false
    });

    // Create workers
    for (let i = 0; i < workerCount; i++) {
      this.createWorker();
    }

    // Handle worker events
    this.setupWorkerEvents();
    
    // Setup graceful shutdown
    this.setupGracefulShutdown();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Setup admin interface
    this.setupAdminInterface();

    logger.info(`Cluster master initialized with ${this.workers.size} workers`);
  }

  createWorker() {
    const worker = cluster.fork();
    const workerId = worker.id;
    
    this.workers.set(workerId, worker);
    this.workerStats.set(workerId, {
      startTime: Date.now(),
      restarts: 0,
      requests: 0,
      memory: 0,
      cpu: 0,
      status: 'starting'
    });
    
    // Initialize restart count
    if (!this.restartCount.has(workerId)) {
      this.restartCount.set(workerId, 0);
    }

    logger.info(`Worker ${workerId} (PID: ${worker.process.pid}) started`);

    // Setup worker communication
    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    return worker;
  }

  setupWorkerEvents() {
    cluster.on('online', (worker) => {
      const stats = this.workerStats.get(worker.id);
      if (stats) {
        stats.status = 'online';
      }
      logger.info(`Worker ${worker.id} is online`);
    });

    cluster.on('listening', (worker, address) => {
      const stats = this.workerStats.get(worker.id);
      if (stats) {
        stats.status = 'listening';
      }
      logger.info(`Worker ${worker.id} listening on ${address.address}:${address.port}`);
    });

    cluster.on('disconnect', (worker) => {
      logger.warn(`Worker ${worker.id} disconnected`);
    });

    cluster.on('exit', (worker, code, signal) => {
      this.handleWorkerExit(worker, code, signal);
    });
  }

  handleWorkerExit(worker, code, signal) {
    const workerId = worker.id;
    const stats = this.workerStats.get(workerId);
    
    logger.error(`Worker ${workerId} died (PID: ${worker.process.pid}, Code: ${code}, Signal: ${signal})`);

    // Clean up worker references
    this.workers.delete(workerId);
    
    if (stats) {
      stats.status = 'dead';
    }

    // Don't restart if shutting down
    if (this.isShuttingDown) {
      return;
    }

    // Check restart limits
    const restarts = this.restartCount.get(workerId) || 0;
    if (restarts >= this.maxRestarts) {
      logger.error(`Worker ${workerId} exceeded maximum restart limit (${this.maxRestarts})`);
      return;
    }

    // Restart worker after delay
    setTimeout(() => {
      if (!this.isShuttingDown) {
        logger.info(`Restarting worker ${workerId} (attempt ${restarts + 1}/${this.maxRestarts})`);
        this.restartCount.set(workerId, restarts + 1);
        this.createWorker();
      }
    }, this.restartDelay);
  }

  handleWorkerMessage(workerId, message) {
    const { type, data } = message;

    switch (type) {
      case 'stats':
        this.updateWorkerStats(workerId, data);
        break;
        
      case 'health':
        this.updateWorkerHealth(workerId, data);
        break;
        
      case 'error':
        logger.error(`Worker ${workerId} error:`, data);
        break;
        
      case 'shutdown':
        logger.info(`Worker ${workerId} requesting shutdown`);
        this.gracefulShutdownWorker(workerId);
        break;
        
      default:
        logger.debug(`Unknown message type from worker ${workerId}:`, type);
    }
  }

  updateWorkerStats(workerId, stats) {
    const workerStats = this.workerStats.get(workerId);
    if (workerStats) {
      Object.assign(workerStats, stats, {
        lastUpdate: Date.now()
      });
    }
  }

  updateWorkerHealth(workerId, health) {
    const workerStats = this.workerStats.get(workerId);
    if (workerStats) {
      workerStats.health = health;
      workerStats.lastHealthCheck = Date.now();
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      this.isShuttingDown = true;

      try {
        // Stop accepting new connections
        await this.stopAcceptingConnections();
        
        // Gracefully shutdown all workers
        await this.shutdownAllWorkers();
        
        logger.info('All workers shut down successfully');
        process.exit(0);
        
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // PM2 reload
  }

  async stopAcceptingConnections() {
    // Signal all workers to stop accepting new connections
    for (const [workerId, worker] of this.workers) {
      if (worker.isDead()) continue;
      
      worker.send({ type: 'stop_accepting_connections' });
    }
    
    // Wait a bit for current requests to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  async shutdownAllWorkers() {
    const shutdownPromises = [];
    
    for (const [workerId, worker] of this.workers) {
      if (worker.isDead()) continue;
      
      shutdownPromises.push(this.gracefulShutdownWorker(workerId));
    }
    
    await Promise.all(shutdownPromises);
  }

  async gracefulShutdownWorker(workerId) {
    return new Promise((resolve) => {
      const worker = this.workers.get(workerId);
      if (!worker || worker.isDead()) {
        resolve();
        return;
      }

      // Set timeout for forced shutdown
      const forceTimeout = setTimeout(() => {
        logger.warn(`Force killing worker ${workerId}`);
        worker.kill('SIGKILL');
        resolve();
      }, 30000); // 30 seconds

      // Listen for worker exit
      worker.once('exit', () => {
        clearTimeout(forceTimeout);
        resolve();
      });

      // Send graceful shutdown signal
      worker.send({ type: 'graceful_shutdown' });
      
      // Disconnect worker
      worker.disconnect();
    });
  }

  startHealthMonitoring() {
    setInterval(() => {
      this.checkWorkerHealth();
      this.logClusterStats();
    }, 30000); // Every 30 seconds
  }

  checkWorkerHealth() {
    const now = Date.now();
    const healthTimeout = 60000; // 1 minute

    for (const [workerId, stats] of this.workerStats) {
      const worker = this.workers.get(workerId);
      
      if (!worker || worker.isDead()) {
        continue;
      }

      // Check if worker is responsive
      if (stats.lastHealthCheck && (now - stats.lastHealthCheck) > healthTimeout) {
        logger.warn(`Worker ${workerId} appears unresponsive, restarting...`);
        worker.kill('SIGTERM');
      }

      // Request health update
      worker.send({ type: 'health_check' });
    }
  }

  logClusterStats() {
    const totalWorkers = this.workers.size;
    const aliveWorkers = Array.from(this.workers.values()).filter(w => !w.isDead()).length;
    
    const totalRequests = Array.from(this.workerStats.values())
      .reduce((sum, stats) => sum + (stats.requests || 0), 0);
    
    const avgMemory = Array.from(this.workerStats.values())
      .reduce((sum, stats) => sum + (stats.memory || 0), 0) / totalWorkers;

    logger.info('Cluster statistics:', {
      totalWorkers,
      aliveWorkers,
      totalRequests,
      avgMemoryMB: Math.round(avgMemory / 1024 / 1024),
      uptime: Math.round(process.uptime())
    });
  }

  setupAdminInterface() {
    // Setup simple HTTP server for cluster management
    const http = require('http');
    const url = require('url');
    
    const adminServer = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname;
      
      res.setHeader('Content-Type', 'application/json');
      
      switch (path) {
        case '/cluster/stats':
          this.handleStatsRequest(res);
          break;
          
        case '/cluster/workers':
          this.handleWorkersRequest(res);
          break;
          
        case '/cluster/restart':
          this.handleRestartRequest(res, parsedUrl.query);
          break;
          
        case '/cluster/health':
          this.handleHealthRequest(res);
          break;
          
        default:
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    const adminPort = process.env.CLUSTER_ADMIN_PORT || 3001;
    adminServer.listen(adminPort, 'localhost', () => {
      logger.info(`Cluster admin interface listening on port ${adminPort}`);
    });
  }

  handleStatsRequest(res) {
    const stats = this.getClusterStats();
    res.end(JSON.stringify(stats, null, 2));
  }

  handleWorkersRequest(res) {
    const workers = Array.from(this.workerStats.entries()).map(([id, stats]) => ({
      id,
      ...stats,
      alive: this.workers.has(id) && !this.workers.get(id).isDead()
    }));
    
    res.end(JSON.stringify(workers, null, 2));
  }

  handleRestartRequest(res, query) {
    const workerId = parseInt(query.worker);
    
    if (workerId && this.workers.has(workerId)) {
      const worker = this.workers.get(workerId);
      worker.kill('SIGTERM');
      res.end(JSON.stringify({ message: `Worker ${workerId} restart initiated` }));
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid worker ID' }));
    }
  }

  handleHealthRequest(res) {
    const health = {
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      workers: this.workers.size,
      aliveWorkers: Array.from(this.workers.values()).filter(w => !w.isDead()).length,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    
    res.end(JSON.stringify(health, null, 2));
  }

  getClusterStats() {
    return {
      master: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      workers: Array.from(this.workerStats.entries()).map(([id, stats]) => ({
        id,
        ...stats,
        alive: this.workers.has(id) && !this.workers.get(id).isDead()
      })),
      totals: {
        workers: this.workers.size,
        requests: Array.from(this.workerStats.values())
          .reduce((sum, stats) => sum + (stats.requests || 0), 0)
      }
    };
  }

  setupWorker() {
    // Worker process setup
    logger.info(`Worker ${process.pid} starting...`);

    // Handle master messages
    process.on('message', (message) => {
      this.handleMasterMessage(message);
    });

    // Send periodic stats to master
    this.startWorkerStatsReporting();
    
    // Setup graceful shutdown for worker
    this.setupWorkerShutdown();
  }

  handleMasterMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'health_check':
        this.sendHealthToMaster();
        break;
        
      case 'graceful_shutdown':
        this.initiateWorkerShutdown();
        break;
        
      case 'stop_accepting_connections':
        this.stopAcceptingConnections();
        break;
        
      default:
        logger.debug('Unknown message from master:', type);
    }
  }

  startWorkerStatsReporting() {
    setInterval(() => {
      const stats = {
        requests: this.getRequestCount(),
        memory: process.memoryUsage().heapUsed,
        cpu: process.cpuUsage(),
        uptime: process.uptime()
      };
      
      process.send({ type: 'stats', data: stats });
    }, 10000); // Every 10 seconds
  }

  sendHealthToMaster() {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    process.send({ type: 'health', data: health });
  }

  setupWorkerShutdown() {
    process.on('SIGTERM', () => {
      this.initiateWorkerShutdown();
    });
  }

  initiateWorkerShutdown() {
    logger.info(`Worker ${process.pid} shutting down gracefully...`);
    
    // Close server and perform cleanup
    if (global.server) {
      global.server.close(() => {
        logger.info(`Worker ${process.pid} server closed`);
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  getRequestCount() {
    // This would be implemented to track actual request count
    // For now, return a placeholder
    return global.requestCount || 0;
  }
}

module.exports = new ClusterManager();