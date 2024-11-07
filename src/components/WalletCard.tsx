import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface WalletCardProps {
  address: string;
  balance: number;
  usdValue: number;
  onUpdatePrice: () => void;
}

const WalletCard = ({ address, balance, usdValue, onUpdatePrice }: WalletCardProps) => {
  const { toast } = useToast();

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    toast({
      title: "Address copied",
      description: "Bitcoin address copied to clipboard",
    });
  };

  return (
    <Card className="wallet-card p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-heading font-semibold text-primary">Cold Wallet</h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hover:text-primary"
            onClick={onUpdatePrice}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hover:text-primary"
            onClick={() => window.open(`https://mempool.space/address/${address}`, '_blank')}
          >
            <ExternalLink className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Balance</div>
        <div className="text-2xl font-bold">{balance} BTC</div>
        <div className="text-sm text-muted-foreground">${usdValue.toLocaleString()}</div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Address</div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-mono bg-secondary p-2 rounded flex-1 truncate">
            {address}
          </div>
          <Button variant="outline" size="icon" onClick={copyAddress}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default WalletCard;