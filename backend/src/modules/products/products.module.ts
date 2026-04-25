import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Reflector } from '@nestjs/core';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, Reflector],
  exports: [ProductsService],
})
export class ProductsModule {}
