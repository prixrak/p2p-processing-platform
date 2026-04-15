import { PipeTransform, Injectable } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '@p2p/shared';

@Injectable()
export class MaxPageSizePipe implements PipeTransform<number, number> {
  transform(value: number): number {
    return Math.min(Math.max(value, 1), MAX_PAGE_SIZE);
  }
}
