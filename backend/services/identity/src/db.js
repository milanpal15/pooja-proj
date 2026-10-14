import mongoose from 'mongoose';

/** Connects to this service's OWN database: the base URI plus `dbName` (any db in the URI path is overridden). */
export async function connectDb({ mongodbUri, dbName }) {
  await mongoose.connect(mongodbUri, { dbName, serverSelectionTimeoutMS: 10_000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return mongoose.connection;
}

export const pingDb = () => mongoose.connection.db.admin().ping();
