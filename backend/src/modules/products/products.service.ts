import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { promises as fsp, Dirent } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const TMP_URL_PREFIX = '/uploads/products/tmp/';

function uploadsBase(): string {
  return path.join(process.cwd(), 'uploads');
}

function urlToAbsPath(url: string): string {
  const relative = url.replace(/^\/uploads\//, '');
  return path.join(uploadsBase(), relative);
}

function productDirAbs(productId: string): string {
  return path.join(uploadsBase(), 'products', productId);
}

function rewriteToProductUrl(url: string, productId: string): string {
  return `/uploads/products/${productId}/${path.basename(url)}`;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // FIX (1): move a tmp URL into the product's own folder and return the new URL.
  // Non-tmp URLs are returned unchanged.
  private async moveTmpFile(url: string, productId: string): Promise<string> {
    if (!url.startsWith(TMP_URL_PREFIX)) return url;

    const src = urlToAbsPath(url);
    const destDir = productDirAbs(productId);
    await fsp.mkdir(destDir, { recursive: true });

    const dest = path.join(destDir, path.basename(url));
    await fsp.rename(src, dest);

    return rewriteToProductUrl(url, productId);
  }

  // FIX (1): remove files in the product folder that are no longer referenced.
  private async cleanOrphans(productId: string, keepUrls: string[]): Promise<void> {
    const dir = productDirAbs(productId);
    const keepSet = new Set(keepUrls.map((u) => path.basename(u)));

    let entries: Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile() || keepSet.has(entry.name)) continue;
      try {
        await fsp.unlink(path.join(dir, entry.name));
      } catch (e) {
        this.logger.warn(`Could not delete orphan ${entry.name}: ${String(e)}`);
      }
    }
  }

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        coverImage: dto.coverImage ?? null,
        gallery: dto.gallery ?? [],
      },
    });

    // FIX (1): move any tmp files into the product's own folder
    let coverImage = product.coverImage;
    if (coverImage !== null) {
      try {
        coverImage = await this.moveTmpFile(coverImage, product.id);
      } catch (e) {
        this.logger.warn(`Could not move coverImage for product ${product.id}: ${String(e)}`);
      }
    }

    const gallery = await Promise.all(
      product.gallery.map(async (url) => {
        try {
          return await this.moveTmpFile(url, product.id);
        } catch (e) {
          this.logger.warn(`Could not move gallery file for product ${product.id}: ${String(e)}`);
          return url;
        }
      }),
    );

    const changed =
      coverImage !== product.coverImage ||
      gallery.length !== product.gallery.length ||
      gallery.some((u, i) => u !== product.gallery[i]);

    if (!changed) return product;

    return this.prisma.product.update({
      where: { id: product.id },
      data: { coverImage, gallery },
    });
  }

  async findAll() {
    return this.prisma.product.findMany();
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(id);

    // FIX (1): move any tmp files into the product's own folder
    let newCoverImage: string | null | undefined = undefined;
    if (dto.coverImage !== undefined) {
      if (dto.coverImage === null) {
        newCoverImage = null;
      } else {
        try {
          newCoverImage = await this.moveTmpFile(dto.coverImage, id);
        } catch (e) {
          this.logger.warn(`Could not move coverImage for product ${id}: ${String(e)}`);
          newCoverImage = dto.coverImage;
        }
      }
    }

    let newGallery: string[] | undefined = undefined;
    if (dto.gallery !== undefined) {
      newGallery = await Promise.all(
        dto.gallery.map(async (url) => {
          try {
            return await this.moveTmpFile(url, id);
          } catch (e) {
            this.logger.warn(`Could not move gallery file for product ${id}: ${String(e)}`);
            return url;
          }
        }),
      );
    }

    const coverImage = newCoverImage !== undefined ? newCoverImage : existing.coverImage;
    const gallery = newGallery !== undefined ? newGallery : existing.gallery;

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        coverImage,
        gallery,
      },
    });

    // FIX (1): delete files in the product folder that are no longer referenced
    const keepUrls = [
      ...(updated.coverImage ? [updated.coverImage] : []),
      ...updated.gallery,
    ].filter((u) => !u.startsWith(TMP_URL_PREFIX));
    await this.cleanOrphans(id, keepUrls);

    return updated;
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });

    // FIX (2): best-effort cleanup of the product's upload folder
    const dir = productDirAbs(product.id);
    try {
      await fsp.rm(dir, { recursive: true, force: true });
    } catch (e) {
      this.logger.warn(`Could not delete upload dir for product ${id}: ${String(e)}`);
    }

    return product;
  }
}
