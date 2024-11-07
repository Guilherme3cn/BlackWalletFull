import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WalletCard from '@/components/WalletCard';
import SeedPhrase from '@/components/SeedPhrase';
import { generateSeedPhrase, generateBitcoinAddress, getAddressBalance } from '@/utils/cryptoUtils';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useQuery } from '@tanstack/react-query';

const WALLET_DATA_KEY = 'bitcoin-wallet-data';

const Index = () => {
  const [address, setAddress] = useState('');
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

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
    enabled: false,
  });

  const { data: balance = 0, refetch: refetchBalance, error: balanceError } = useQuery({
    queryKey: ['balance', address],
    queryFn: () => getAddressBalance(address),
    enabled: !!address,
    refetchInterval: 30000,
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
      const savedWalletData = localStorage.getItem(WALLET_DATA_KEY);
      
      if (savedWalletData) {
        const { address: savedAddress, seedPhrase: savedSeedPhrase } = JSON.parse(savedWalletData);
        setSeedPhrase(savedSeedPhrase);
        setAddress(savedAddress);
      } else {
        const newSeedPhrase = generateSeedPhrase();
        const newAddress = generateBitcoinAddress(newSeedPhrase);
        
        localStorage.setItem(WALLET_DATA_KEY, JSON.stringify({
          address: newAddress,
          seedPhrase: newSeedPhrase
        }));
        
        setSeedPhrase(newSeedPhrase);
        setAddress(newAddress);
      }
    };

    initializeWallet();
  }, []);

  const handleUpdateBtcPrice = async () => {
    try {
      await refetchBtcPrice();
      toast({
        title: "Preço do Bitcoin atualizado",
        description: "O valor foi atualizado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar preço",
        description: "Verifique sua conexão com a internet",
        variant: "destructive",
      });
    }
  };

  const regenerateWallet = async () => {
    const newSeedPhrase = generateSeedPhrase();
    const newAddress = generateBitcoinAddress(newSeedPhrase);
    
    // Save new wallet data
    localStorage.setItem(WALLET_DATA_KEY, JSON.stringify({
      address: newAddress,
      seedPhrase: newSeedPhrase
    }));
    
    setSeedPhrase(newSeedPhrase);
    setAddress(newAddress);
    await refetchBalance();
    await refetchBtcPrice();

    toast({
      title: "Nova carteira gerada",
      description: "Guarde sua frase semente em um local seguro!",
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('wallet-password');
    localStorage.removeItem(WALLET_DATA_KEY);
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado da sua carteira",
    });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black overflow-y-auto overscroll-y-contain -webkit-overflow-scrolling-touch">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center sticky top-0 bg-black z-10 py-4">
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
          onUpdatePrice={handleUpdateBtcPrice}
        />

        <SeedPhrase words={seedPhrase} />

        <p className="text-sm text-muted-foreground text-center pb-6">
          ⚠️ Mantenha sua frase semente segura. Nunca compartilhe com ninguém.
        </p>
      </div>
    </div>
  );
};

export default Index;
