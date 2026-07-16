import { DocKind } from '@prisma/client';
import { requiredOrderDocKinds } from './documents.service';

describe('requiredOrderDocKinds', () => {
  it('без комплектующих: чек → договор, без сохранной', () => {
    expect(requiredOrderDocKinds(0)).toEqual([
      DocKind.RECEIPT_SERVICE,
      DocKind.CONTRACT,
    ]);
    expect(requiredOrderDocKinds(0)).not.toContain(DocKind.RECEIPT_SD);
  });

  it('при сумме комплектующих > 0: чек → договор → чек/фото запчастей', () => {
    expect(requiredOrderDocKinds(100)).toEqual([
      DocKind.RECEIPT_SERVICE,
      DocKind.CONTRACT,
      DocKind.RECEIPT_PARTS,
      DocKind.PARTS_PHOTO,
    ]);
    expect(requiredOrderDocKinds(100)).not.toContain(DocKind.RECEIPT_SD);
  });
});
