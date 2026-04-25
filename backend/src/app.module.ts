import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './modules/products/products.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [PrismaModule, ProductsModule, UploadsModule],
})
export class AppModule {}
