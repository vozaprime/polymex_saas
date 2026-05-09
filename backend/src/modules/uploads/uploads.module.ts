import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { Reflector } from '@nestjs/core';

@Module({
  controllers: [UploadsController],
  providers: [Reflector],
})
export class UploadsModule {}
