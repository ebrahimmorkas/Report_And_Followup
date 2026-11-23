import mongoose from 'mongoose';

export const isValidId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id);
