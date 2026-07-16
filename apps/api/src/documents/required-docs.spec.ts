import { DocKind } from '@prisma/client';
import { requiredOrderDocKinds } from './documents.service';

describe('requiredOrderDocKinds', () => {
  it('без комплектующих не требует чек/фото и не требует сохранную', () => {
    expect(requiredOrderDocKinds(0)).toEqual([
      DocKind.CONTRACT,
      DocKind.RECEIPT_SERVICE,
    ]);
    expect(requiredOrderDocKinds(0)).not.toContain(DocKind.RECEIPT_SD);
  });

  it('при сумме комплектующих > 0 требует чек и фото, без сохранной', () => {
    expect(requiredOrderDocKinds(100)).toEqual([
      DocKind.CONTRACT,
      DocKind.RECEIPT_SERVICE,
      DocKind.RECEIPT_PARTS,
      DocKind.PARTS_PHOTO,
    ]);
    expect(requiredOrderDocKinds(100)).not.toContain(DocKind.RECEIPT_SD);
  });
});
