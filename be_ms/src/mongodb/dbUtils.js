/**
 * Database Utilities and Maintenance Script
 * 
 * Provides utility functions for database health checks, maintenance tasks,
 * and administrative operations.
 * 
 * Usage: 
 *   node src/dbUtils.js check        - Check database health
 *   node src/dbUtils.js indexes      - List all indexes
 *   node src/dbUtils.js stats        - Show collection statistics
 *   node src/dbUtils.js cleanup      - Clean up old data
 */

const { mongoose, User, Room, Availability, Booking } = require('./index');

/**
 * Check database connection and basic health
 */
async function checkHealth() {
  console.log('\n=== Database Health Check ===\n');
    
  try {
    // Check connection
    const state = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    console.log(`Connection State: ${states[state]}`);
        
    if (state !== 1) {
      console.log('❌ Database is not connected');
      return false;
    }
        
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\nCollections: ${collections.length}`);
    collections.forEach(col => console.log(`  - ${col.name}`));
        
    // Count documents
    console.log('\nDocument Counts:');
    console.log(`  Users: ${await User.countDocuments()}`);
    console.log(`  Rooms: ${await Room.countDocuments()}`);
    console.log(`  Availability: ${await Availability.countDocuments()}`);
    console.log(`  Bookings: ${await Booking.countDocuments()}`);
        
    // Check for orphaned records
    console.log('\nData Integrity Checks:');
        
    const bookingsWithInvalidUser = await Booking.countDocuments({
      user_id: { $exists: true },
    }).then(async (total) => {
      const validBookings = await Booking.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $match: { 'user': { $ne: [] } } },
        { $count: 'count' },
      ]);
      return total - (validBookings[0]?.count || 0);
    });
        
    const bookingsWithInvalidRoom = await Booking.countDocuments({
      room_id: { $exists: true },
    }).then(async (total) => {
      const validBookings = await Booking.aggregate([
        {
          $lookup: {
            from: 'rooms',
            localField: 'room_id',
            foreignField: '_id',
            as: 'room',
          },
        },
        { $match: { 'room': { $ne: [] } } },
        { $count: 'count' },
      ]);
      return total - (validBookings[0]?.count || 0);
    });
        
    console.log(`  Bookings with invalid user_id: ${bookingsWithInvalidUser}`);
    console.log(`  Bookings with invalid room_id: ${bookingsWithInvalidRoom}`);
        
    if (bookingsWithInvalidUser > 0 || bookingsWithInvalidRoom > 0) {
      console.log('\n⚠️  Warning: Orphaned booking records detected');
    } else {
      console.log('\n✓ No orphaned records detected');
    }
        
    console.log('\n✓ Database health check completed\n');
    return true;
        
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

/**
 * List all indexes for each collection
 */
async function listIndexes() {
  console.log('\n=== Database Indexes ===\n');
    
  try {
    const collections = [
      { name: 'Users', model: User },
      { name: 'Rooms', model: Room },
      { name: 'Availability', model: Availability },
      { name: 'Bookings', model: Booking },
    ];
        
    for (const { name, model } of collections) {
      console.log(`\n${name} Collection:`);
      const indexes = await model.collection.getIndexes();
            
      for (const [indexName, indexDef] of Object.entries(indexes)) {
        console.log(`  ${indexName}:`);
        console.log(`    Keys: ${JSON.stringify(indexDef.key)}`);
        if (indexDef.unique) console.log('    Unique: true');
        if (indexDef.sparse) console.log('    Sparse: true');
      }
    }
        
    console.log('\n');
        
  } catch (error) {
    console.error('❌ Failed to list indexes:', error.message);
  }
}

/**
 * Show collection statistics
 */
async function showStats() {
  console.log('\n=== Collection Statistics ===\n');
    
  try {
    const collections = ['users', 'rooms', 'availabilities', 'bookings'];
        
    for (const collName of collections) {
      const stats = await mongoose.connection.db.collection(collName).stats();
            
      console.log(`\n${collName.toUpperCase()}:`);
      console.log(`  Documents: ${stats.count.toLocaleString()}`);
      console.log(`  Average Document Size: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
      console.log(`  Total Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Indexes: ${stats.nindexes}`);
      console.log(`  Index Size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
    }
        
    console.log('\n');
        
  } catch (error) {
    console.error('❌ Failed to get statistics:', error.message);
  }
}

/**
 * Clean up old data
 */
async function cleanup(dryRun = true) {
  console.log('\n=== Database Cleanup ===\n');
    
  if (dryRun) {
    console.log('Running in DRY RUN mode (no data will be deleted)\n');
  } else {
    console.log('⚠️  LIVE MODE - Data will be deleted!\n');
  }
    
  try {
    // Clean up old availability records (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
        
    const oldAvailability = await Availability.countDocuments({
      date: { $lt: thirtyDaysAgo },
    });
        
    console.log(`Old availability records (>30 days): ${oldAvailability}`);
        
    if (!dryRun && oldAvailability > 0) {
      const result = await Availability.deleteMany({
        date: { $lt: thirtyDaysAgo },
      });
      console.log(`  ✓ Deleted ${result.deletedCount} records`);
    }
        
    // Archive old completed bookings (older than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
    const oldBookings = await Booking.countDocuments({
      status: 'completed',
      end_date: { $lt: oneYearAgo },
    });
        
    console.log(`\nOld completed bookings (>1 year): ${oldBookings}`);
        
    if (!dryRun && oldBookings > 0) {
      // In production, you'd move these to an archive collection
      console.log('  ⚠️  Archive functionality not implemented');
      console.log('  (Would archive to separate collection or cold storage)');
    }
        
    // Find and report cancelled bookings that can be cleaned up
    const oldCancelled = await Booking.countDocuments({
      status: 'cancelled',
      cancelled_at: { $lt: oneYearAgo },
    });
        
    console.log(`\nOld cancelled bookings (>1 year): ${oldCancelled}`);
        
    if (dryRun) {
      console.log('\nDry run completed. Run with --live to execute cleanup.\n');
    } else {
      console.log('\nCleanup completed.\n');
    }
        
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

/**
 * Verify data consistency
 */
async function verifyConsistency() {
  console.log('\n=== Data Consistency Verification ===\n');
    
  try {
    let issues = 0;
        
    // Check availability records don't have available > total
    console.log('Checking availability records...');
    const invalidAvailability = await Availability.countDocuments({
      $expr: { $gt: ['$available_units', '$total_units'] },
    });
        
    if (invalidAvailability > 0) {
      console.log(`  ❌ Found ${invalidAvailability} records with available > total`);
      issues++;
    } else {
      console.log('  ✓ All availability records valid');
    }
        
    // Check bookings have valid date ranges
    console.log('\nChecking booking date ranges...');
    const invalidBookings = await Booking.countDocuments({
      $expr: { $gte: ['$start_date', '$end_date'] },
    });
        
    if (invalidBookings > 0) {
      console.log(`  ❌ Found ${invalidBookings} bookings with invalid date ranges`);
      issues++;
    } else {
      console.log('  ✓ All booking date ranges valid');
    }
        
    // Check for negative availability
    console.log('\nChecking for negative availability...');
    const negativeAvailability = await Availability.countDocuments({
      available_units: { $lt: 0 },
    });
        
    if (negativeAvailability > 0) {
      console.log(`  ❌ Found ${negativeAvailability} records with negative availability`);
      issues++;
    } else {
      console.log('  ✓ No negative availability found');
    }
        
    // Summary
    console.log('\n' + '='.repeat(40));
    if (issues === 0) {
      console.log('✓ Data consistency verification passed');
    } else {
      console.log(`⚠️  Found ${issues} consistency issue(s)`);
    }
    console.log('='.repeat(40) + '\n');
        
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

/**
 * Create missing availability records for active rooms
 */
async function ensureAvailability(days = 90) {
  console.log(`\n=== Ensuring Availability (${days} days) ===\n`);
    
  try {
    const { initializeAvailability } = require('./index');
    const activeRooms = await Room.find({ is_active: true });
        
    console.log(`Found ${activeRooms.length} active rooms\n`);
        
    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
        
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);
        
    for (const room of activeRooms) {
      const totalUnits = 1; // Default, adjust as needed
      await initializeAvailability(room._id, totalUnits, startDate, endDate);
      console.log(`✓ Ensured availability for: ${room.name}`);
    }
        
    console.log('\n✓ Availability ensured for all active rooms\n');
        
  } catch (error) {
    console.error('❌ Failed to ensure availability:', error.message);
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const flag = process.argv[3];
    
  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 2000));
    
  switch (command) {
  case 'check':
    await checkHealth();
    break;
            
  case 'indexes':
    await listIndexes();
    break;
            
  case 'stats':
    await showStats();
    break;
            
  case 'cleanup':
    const isLive = flag === '--live';
    await cleanup(!isLive);
    break;
            
  case 'verify':
    await verifyConsistency();
    break;
            
  case 'ensure-availability':
    const days = parseInt(flag) || 90;
    await ensureAvailability(days);
    break;
            
  case 'all':
    await checkHealth();
    await listIndexes();
    await showStats();
    await verifyConsistency();
    break;
            
  default:
    console.log('\nUsage: node src/dbUtils.js <command> [options]\n');
    console.log('Commands:');
    console.log('  check                    - Check database health');
    console.log('  indexes                  - List all indexes');
    console.log('  stats                    - Show collection statistics');
    console.log('  cleanup [--live]         - Clean up old data (dry run by default)');
    console.log('  verify                   - Verify data consistency');
    console.log('  ensure-availability [N]  - Ensure N days of availability (default: 90)');
    console.log('  all                      - Run all checks\n');
    process.exit(1);
  }
    
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = {
  checkHealth,
  listIndexes,
  showStats,
  cleanup,
  verifyConsistency,
  ensureAvailability,
};
