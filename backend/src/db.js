import mongoose from 'mongoose';
import { MONGO_URI } from './config.js';

export async function connectDB(){
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('[db] connected');
  } catch (err) {
    console.error('[db] connection error:', err.message);
    process.exit(1);
  }
}
