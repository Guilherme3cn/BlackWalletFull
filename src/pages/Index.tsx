import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WalletCard from '@/components/WalletCard';
import SeedPhrase from '@/components/SeedPhrase';
import { generateSeedPhrase, generateBitcoinAddress, getAddressBalance } from '@/utils/cryptoUtils';
import { Button } from '@/components/ui/button';
import { RefreshCw, LogOut } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useQuery } from '@tanstack/react-query';

const Index = () => {
  const [address, setAddress] = useState('');
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch BTC price using CoinGecko API with 1-hour refetch interval
  const { data: btcPrice, refetch: refetchBtcPrice } = useQuery({
    queryKey: ['btcPrice'],
    queryFn: async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        return data.bitcoin.usd;
      } catch (error) {
        toast({
          title: "Erro ao atualizar preço do Bitcoin",
          description: "Verifique sua conexão com a internet",
          variant: "destructive",
        });
        return null;
      }
    },
    refetchInterval: 3600000, // Refresh every hour (3,600,000 milliseconds)
    refetchIntervalInBackground: true, // Continue refetching even if app is in background
  });

  // Fetch balance automatically
  const { data: balance = 0, refetch: refetchBalance, error: balanceError } = useQuery({
    queryKey: ['balance', address],
    queryFn: () => getAddressBalance(address),
    enabled: !!address,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Handle balance error
  useEffect(() => {
    if (balanceError) {
      toast({
        title: "Erro ao atualizar saldo",
        description: "Verifique sua conexão com a internet",
        variant: "destructive",
      });
    }
  }, [balanceError, toast]);

  useEffect(() => {
    const initializeWallet = async () => {
      const newSeedPhrase = generateSeedPhrase();
      setSeedPhrase(newSeedPhrase);
      const newAddress = generateBitcoinAddress(newSeedPhrase);
      setAddress(newAddress);
    };

    initializeWallet();
  }, []);

  const regenerateWallet = async () => {
    const newSeedPhrase = generateSeedPhrase();
    setSeedPhrase(newSeedPhrase);
    const newAddress = generateBitcoinAddress(newSeedPhrase);
    setAddress(newAddress);
    await refetchBalance();
    await refetchBtcPrice(); // Also refetch BTC price when regenerating wallet

    toast({
      title: "Nova carteira gerada",
      description: "Guarde sua frase semente em um local seguro!",
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('wallet-password');
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado da sua carteira",
    });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-heading font-bold text-primary">
            Bitcoin Cold Wallet
          </h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={regenerateWallet}
              className="hover:text-primary"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Nova Carteira
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="hover:bg-red-600"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>

        <WalletCard
          address={address}
          balance={balance}
          usdValue={balance * (btcPrice || 0)}
        />

        <SeedPhrase words={seedPhrase} />

        <p className="text-sm text-muted-foreground text-center">
          ⚠️ Mantenha sua frase semente segura. Nunca compartilhe com ninguém.
        </p>
      </div>
    </div>
  );
};

export default Index;