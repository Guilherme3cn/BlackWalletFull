import React, { useEffect, useState } from 'react';
import WalletCard from '@/components/WalletCard';
import SeedPhrase from '@/components/SeedPhrase';
import { generateSeedPhrase, generateBitcoinAddress } from '@/utils/cryptoUtils';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const Index = () => {
  const [address, setAddress] = useState('');
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const [balance] = useState(0); // In a real app, this would be fetched
  const [usdPrice] = useState(43000); // In a real app, this would be fetched

  useEffect(() => {
    // Generate new wallet on first load
    setAddress(generateBitcoinAddress());
    setSeedPhrase(generateSeedPhrase());
  }, []);

  const regenerateWallet = () => {
    setAddress(generateBitcoinAddress());
    setSeedPhrase(generateSeedPhrase());
  };

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-heading font-bold text-primary">
            Bitcoin Cold Wallet
          </h1>
          <Button
            variant="outline"
            onClick={regenerateWallet}
            className="hover:text-primary"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            New Wallet
          </Button>
        </div>

        <WalletCard
          address={address}
          balance={balance}
          usdValue={balance * usdPrice}
        />

        <SeedPhrase words={seedPhrase} />

        <p className="text-sm text-muted-foreground text-center">
          ⚠️ Keep your seed phrase safe. Never share it with anyone.
        </p>
      </div>
    </div>
  );
};

export default Index;