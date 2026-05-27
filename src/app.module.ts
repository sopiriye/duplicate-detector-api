import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { MerchantsModule } from './merchants/merchants.module';

@Module({
  imports: [DatabaseModule, AuthModule, MerchantsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

//i need to be aware that i have to put logger where necessary.

// i think i would need to put loggers at every NestJS request-response cycle, especially in the guards and services where critical operations happen, such as authentication and role checks. This way, I can track the flow of requests and identify any issues or unauthorized access attempts effectively.
