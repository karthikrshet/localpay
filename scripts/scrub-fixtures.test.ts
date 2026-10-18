import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS, scrub } from './scrub-fixtures.ts';

describe('scrub', () => {
  it('replaces personal fields by name but keeps structure and ids', () => {
    const payment = {
      id: 'pay_29QQoUBi66xm2f', entity: 'payment', amount: 50000, email: 'real.person@gmail.com', contact: '+919876543210',
      vpa: 'realperson@okhdfc', notes: { customer: 'Anita' }, card: { last4: '4242', name: 'ANITA R' }, error_code: null,
    };
    expect(scrub(payment)).toEqual({
      id: 'pay_29QQoUBi66xm2f', entity: 'payment', amount: 50000, email: PLACEHOLDERS.email, contact: PLACEHOLDERS.contact,
      vpa: PLACEHOLDERS.vpa, notes: { customer: 'Anita' }, card: { last4: '1111', name: PLACEHOLDERS.name }, error_code: null,
    });
  });

  it('scrubs keys, emails, phones, card numbers and IPs inside free text', () => {
    const text = 'key rzp_live_AbCdEf123456 by ops@shop.in from 10.1.2.3 call 9876543210 card 4111111111111111';
    expect(scrub(text)).toBe(`key ${PLACEHOLDERS.keyId} by ${PLACEHOLDERS.email} from ${PLACEHOLDERS.ip} call ${PLACEHOLDERS.contact} card [CARD-OR-ACCOUNT-NUMBER]`);
  });

  it('scrubs account ids and secrets', () => {
    expect(scrub({ account_id: 'acc_ABCDEFGHIJKLMN', key_secret: 'abc', headers: { Authorization: 'Basic eHg6eXk=' } })).toEqual({
      account_id: PLACEHOLDERS.accountId, key_secret: PLACEHOLDERS.secret, headers: { Authorization: PLACEHOLDERS.secret },
    });
  });

  it('leaves amounts, timestamps and nulls alone', () => {
    const value = { amount: 9876543210, created_at: 1760800000, email: null };
    expect(scrub(value)).toEqual(value);
  });

  it('is idempotent', () => {
    const once = scrub({ email: 'a@b.co', text: 'rzp_test_ABCDEFGHIJKLMN' });
    expect(scrub(once)).toEqual(once);
  });
});
