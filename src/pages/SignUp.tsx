import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { LogIn, Key } from 'lucide-react';

const SignUp = () => {
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (password.length >= 8) {
      localStorage.setItem('wallet-password', password);
      toast({
        title: "Senha cadastrada com sucesso",
        description: "Sua carteira está protegida",
      });
      navigate('/');
    } else {
      toast({
        title: "Senha inválida",
        description: "A senha deve ter pelo menos 8 caracteres",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-heading font-bold text-primary">
            Criar Senha
          </h2>
          <p className="mt-2 text-muted-foreground">
            Crie uma senha para proteger sua carteira
          </p>
        </div>

        <form onSubmit={handleSignUp} className="mt-8 space-y-6">
          <div className="space-y-4">
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
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Confirme sua senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10"
                required
                minLength={8}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg">
            <LogIn className="mr-2 h-4 w-4" />
            Criar Senha
          </Button>
        </form>

        <div className="text-center">
          <Button
            variant="link"
            className="text-primary"
            onClick={() => navigate('/login')}
          >
            Já tem uma senha? Conecte-se
          </Button>
        </div>

        <p className="text-sm text-center text-muted-foreground mt-4">
          Sua senha é armazenada localmente e usada para proteger sua carteira
        </p>
      </div>
    </div>
  );
};

export default SignUp;