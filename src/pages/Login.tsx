import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { LogIn, Key } from 'lucide-react';

const Login = () => {
  const [password, setPassword] = React.useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    const storedPassword = localStorage.getItem('wallet-password');
    
    if (password === storedPassword) {
      localStorage.setItem('wallet-password', password); // Ensure password is stored
      toast({
        title: "Login realizado com sucesso",
        description: "Bem-vindo à sua carteira Bitcoin",
      });
      navigate('/', { replace: true });
    } else {
      toast({
        title: "Senha incorreta",
        description: "Por favor, verifique sua senha",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-heading font-bold text-primary">
            Bitcoin Wallet
          </h2>
          <p className="mt-2 text-muted-foreground">
            Digite sua senha para acessar sua carteira
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          <div className="space-y-2">
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required
                minLength={8}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg">
            <LogIn className="mr-2 h-4 w-4" />
            Acessar Carteira
          </Button>
        </form>

        <div className="text-center">
          <Button
            variant="link"
            className="text-primary"
            onClick={() => navigate('/signup')}
          >
            Não tem uma senha? Criar senha
          </Button>
        </div>

        <p className="text-sm text-center text-muted-foreground mt-4">
          Sua senha é armazenada localmente e usada para proteger sua carteira
        </p>
      </div>
    </div>
  );
};

export default Login;