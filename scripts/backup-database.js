#!/usr/bin/env node

/**
 * Database Backup and Recovery Script
 * Handles MongoDB data backup, export, and recovery operations
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(__dirname, '..', 'backups');
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.mongoURI = process.env.MONGODB_URI;
  }

  async createBackup() {
    console.log('💾 Starting Database Backup...');
    console.log('==============================\n');

    try {
      // Ensure backup directory exists
      this.ensureBackupDirectory();
      
      // Create full database backup
      await this.createFullBackup();
      
      // Export collections individually
      await this.exportCollections();
      
      // Create metadata file
      await this.createBackupMetadata();
      
      console.log('\n✅ Database backup completed successfully!');
      console.log(`📁 Backup location: ${this.backupDir}`);
      
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }

  async createFullBackup() {
    console.log('🗄️ Creating full database backup...');
    
    const backupPath = path.join(this.backupDir, `full-backup-${this.timestamp}`);
    
    return new Promise((resolve, reject) => {
      const mongodump = spawn('mongodump', [
        '--uri', this.mongoURI,
        '--out', backupPath,
        '--gzip'
      ]);

      mongodump.stdout.on('data', (data) => {
        process.stdout.write(data);
      });

      mongodump.stderr.on('data', (data) => {
        process.stderr.write(data);
      });

      mongodump.on('close', (code) => {
        if (code === 0) {
          console.log(`   ✅ Full backup created: ${backupPath}`);
          resolve();
        } else {
          reject(new Error(`mongodump failed with code ${code}`));
        }
      });

      mongodump.on('error', (error) => {
        reject(new Error(`mongodump error: ${error.message}`));
      });
    });
  }

  async exportCollections() {
    console.log('\n📊 Exporting individual collections...');
    
    const collections = [
      'users',
      'matches', 
      'conversations',
      'messages',
      'activities',
      'userswipes',
      'notifications',
      'adminusers'
    ];

    for (const collection of collections) {
      await this.exportCollection(collection);
    }
  }

  async exportCollection(collectionName) {
    const exportPath = path.join(this.backupDir, `${collectionName}-${this.timestamp}.json`);
    
    return new Promise((resolve, reject) => {
      const mongoexport = spawn('mongoexport', [
        '--uri', this.mongoURI,
        '--collection', collectionName,
        '--out', exportPath,
        '--pretty',
        '--jsonArray'
      ]);

      mongoexport.on('close', (code) => {
        if (code === 0) {
          const stats = fs.statSync(exportPath);
          console.log(`   ✅ ${collectionName}: ${(stats.size / 1024).toFixed(2)} KB`);
          resolve();
        } else {
          reject(new Error(`mongoexport failed for ${collectionName} with code ${code}`));
        }
      });

      mongoexport.on('error', (error) => {
        reject(new Error(`mongoexport error for ${collectionName}: ${error.message}`));
      });
    });
  }

  async createBackupMetadata() {
    console.log('\n📋 Creating backup metadata...');
    
    const metadata = {
      timestamp: new Date().toISOString(),
      backupType: 'full',
      mongoURI: this.mongoURI.replace(/\/\/.*:.*@/, '//****:****@'), // Hide credentials
      collections: [],
      fileSize: 0,
      environment: process.env.NODE_ENV || 'development'
    };

    // Get collection statistics
    await mongoose.connect(this.mongoURI);
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    for (const collection of collections) {
      const stats = await db.collection(collection.name).stats();
      metadata.collections.push({
        name: collection.name,
        documentCount: stats.count,
        avgObjSize: stats.avgObjSize,
        dataSize: stats.size,
        indexSize: stats.totalIndexSize
      });
      metadata.fileSize += stats.size;
    }

    await mongoose.disconnect();

    // Save metadata
    const metadataPath = path.join(this.backupDir, `backup-metadata-${this.timestamp}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log(`   ✅ Metadata saved: ${metadataPath}`);
    console.log(`   📊 Total data size: ${(metadata.fileSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   🗂️  Collections backed up: ${metadata.collections.length}`);
  }

  async restoreBackup(backupTimestamp) {
    console.log(`🔄 Restoring Database Backup: ${backupTimestamp}`);
    console.log('============================================\n');

    try {
      const backupPath = path.join(this.backupDir, `full-backup-${backupTimestamp}`);
      
      // Verify backup exists
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupPath}`);
      }

      // Get database name from URI
      const dbName = this.mongoURI.split('/').pop().split('?')[0];
      const restorePath = path.join(backupPath, dbName);

      console.log(`📁 Restoring from: ${restorePath}`);
      console.log(`🎯 Target database: ${dbName}`);

      return new Promise((resolve, reject) => {
        const mongorestore = spawn('mongorestore', [
          '--uri', this.mongoURI,
          '--gzip',
          '--drop', // Drop existing collections before restore
          restorePath
        ]);

        mongorestore.stdout.on('data', (data) => {
          process.stdout.write(data);
        });

        mongorestore.stderr.on('data', (data) => {
          process.stderr.write(data);
        });

        mongorestore.on('close', (code) => {
          if (code === 0) {
            console.log('\n✅ Database restore completed successfully!');
            resolve();
          } else {
            reject(new Error(`mongorestore failed with code ${code}`));
          }
        });

        mongorestore.on('error', (error) => {
          reject(new Error(`mongorestore error: ${error.message}`));
        });
      });

    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      throw error;
    }
  }

  async listBackups() {
    console.log('📋 Available Database Backups');
    console.log('==============================\n');

    if (!fs.existsSync(this.backupDir)) {
      console.log('No backups found. Backup directory does not exist.');
      return [];
    }

    const files = fs.readdirSync(this.backupDir);
    const backups = [];

    // Find backup directories
    const backupDirs = files.filter(file => 
      file.startsWith('full-backup-') && 
      fs.statSync(path.join(this.backupDir, file)).isDirectory()
    );

    for (const backupDir of backupDirs) {
      const timestamp = backupDir.replace('full-backup-', '');
      const backupPath = path.join(this.backupDir, backupDir);
      const metadataPath = path.join(this.backupDir, `backup-metadata-${timestamp}.json`);
      
      let metadata = null;
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      }

      const stats = fs.statSync(backupPath);
      
      const backup = {
        timestamp,
        path: backupPath,
        created: stats.birthtime,
        size: this.getDirectorySize(backupPath),
        metadata
      };

      backups.push(backup);
      
      console.log(`📅 ${timestamp}`);
      console.log(`   📁 Path: ${backupPath}`);
      console.log(`   🕐 Created: ${backup.created.toLocaleString()}`);
      console.log(`   📊 Size: ${(backup.size / (1024 * 1024)).toFixed(2)} MB`);
      if (metadata) {
        console.log(`   🗂️  Collections: ${metadata.collections.length}`);
        console.log(`   🌍 Environment: ${metadata.environment}`);
      }
      console.log('');
    }

    return backups.sort((a, b) => b.created - a.created);
  }

  async cleanupOldBackups(retentionDays = 30) {
    console.log(`🧹 Cleaning up backups older than ${retentionDays} days...`);
    
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const backups = await this.listBackups();
    let deletedCount = 0;

    for (const backup of backups) {
      if (backup.created < cutoffDate) {
        try {
          // Remove backup directory
          fs.rmSync(backup.path, { recursive: true });
          
          // Remove metadata file
          const metadataPath = path.join(this.backupDir, `backup-metadata-${backup.timestamp}.json`);
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
          }

          // Remove individual collection exports
          const files = fs.readdirSync(this.backupDir);
          for (const file of files) {
            if (file.includes(backup.timestamp) && file.endsWith('.json')) {
              fs.unlinkSync(path.join(this.backupDir, file));
            }
          }

          console.log(`   🗑️  Deleted backup: ${backup.timestamp}`);
          deletedCount++;
        } catch (error) {
          console.error(`   ❌ Failed to delete backup ${backup.timestamp}: ${error.message}`);
        }
      }
    }

    console.log(`✅ Cleanup completed: ${deletedCount} backups deleted`);
  }

  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`📁 Created backup directory: ${this.backupDir}`);
    }
  }

  getDirectorySize(dirPath) {
    let totalSize = 0;
    
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        totalSize += this.getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }
}

// CLI Interface
if (require.main === module) {
  require('dotenv').config();
  
  const command = process.argv[2];
  const arg = process.argv[3];
  
  const backup = new DatabaseBackup();
  
  switch (command) {
    case 'create':
      backup.createBackup().catch(error => {
        console.error('Backup failed:', error);
        process.exit(1);
      });
      break;
      
    case 'restore':
      if (!arg) {
        console.error('Please provide backup timestamp: node backup-database.js restore <timestamp>');
        process.exit(1);
      }
      backup.restoreBackup(arg).catch(error => {
        console.error('Restore failed:', error);
        process.exit(1);
      });
      break;
      
    case 'list':
      backup.listBackups().catch(error => {
        console.error('List failed:', error);
        process.exit(1);
      });
      break;
      
    case 'cleanup':
      const days = arg ? parseInt(arg) : 30;
      backup.cleanupOldBackups(days).catch(error => {
        console.error('Cleanup failed:', error);
        process.exit(1);
      });
      break;
      
    default:
      console.log('MongoDB Backup Tool');
      console.log('===================');
      console.log('');
      console.log('Usage:');
      console.log('  node backup-database.js create           - Create new backup');
      console.log('  node backup-database.js restore <timestamp> - Restore backup');
      console.log('  node backup-database.js list             - List all backups');
      console.log('  node backup-database.js cleanup [days]   - Clean old backups (default: 30 days)');
      console.log('');
      console.log('Examples:');
      console.log('  node backup-database.js create');
      console.log('  node backup-database.js restore 2025-06-29T10-30-00-000Z');
      console.log('  node backup-database.js cleanup 7');
      break;
  }
}

module.exports = DatabaseBackup;