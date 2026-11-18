import { PrismaClient } from '@prisma/client';

/** Single PrismaClient for the process. Only server.ts imports this (keeps tests DB-free). */
export const prisma = new PrismaClient({ log: ['warn', 'error'] });
