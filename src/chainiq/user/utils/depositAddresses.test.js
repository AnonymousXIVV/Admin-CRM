import { normalizeDepositNetworks } from './depositAddresses';

describe('normalizeDepositNetworks', () => {
    test('keeps provisioned per-network addresses and trims empty values', () => {
        expect(normalizeDepositNetworks({
            networks: [
                { network: 'Bitcoin (BTC)', addresses: ['  bc1qexample ', '', 'bc1qsecond'] },
            ],
        })).toEqual([
            { network: 'Bitcoin (BTC)', addresses: ['bc1qexample', 'bc1qsecond'] },
        ]);
    });

    test('supports the legacy flat address response', () => {
        expect(normalizeDepositNetworks({
            addresses: ['0xabc'],
            network: 'Ethereum (ERC-20)',
        })).toEqual([
            { network: 'Ethereum (ERC-20)', addresses: ['0xabc'] },
        ]);
    });

    test('merges duplicate network buckets without duplicating addresses', () => {
        expect(normalizeDepositNetworks({
            networks: [
                { network: 'ERC20', addresses: ['a'] },
                { network: 'ERC20', addresses: ['a', 'b'] },
            ],
        })).toEqual([
            { network: 'ERC20', addresses: ['a', 'b'] },
        ]);
    });

    test('merges network labels case-insensitively', () => {
        expect(normalizeDepositNetworks({
            networks: [
                { network: 'erc20', addresses: ['a'] },
                { network: ' ERC20 ', addresses: ['a', 'b'] },
            ],
        })).toEqual([
            { network: 'erc20', addresses: ['a', 'b'] },
        ]);
    });
});
