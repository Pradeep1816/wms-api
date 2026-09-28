import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("/debug-sentry")
  getError() {
    throw new Error("My first Sentry error!");
  }

  @Get("/env")
  getEnv() {
    const myEnv = {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      dbHost: process.env.DB_HOST,
      dbPort: process.env.DB_PORT,
      dbUsername: process.env.DB_USERNAME,
      dbName: process.env.DB_DATABASE,
    }
    return myEnv;
  }
}
