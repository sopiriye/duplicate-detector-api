import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);
  constructor() {
    // super(DatabaseService.buildClientOptions());

    // DatabaseService lifecycle:
    // Validate the runtime database configuration before constructing the Prisma client adapter.
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    super({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      adapter: new PrismaPg(databaseUrl),
    });
  }

  async onModuleInit(): Promise<void> {
    // DatabaseService lifecycle:
    // Establish the Prisma database connection when the Nest module boots.
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    // DatabaseService lifecycle:
    // Close the Prisma database connection gracefully during Nest application shutdown.
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  // private static buildClientOptions(): Prisma.PrismaClientOptions {
  //   return {
  //     log:
  //       process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  //   };
  // }
  //the above method will be review later properly.
}
