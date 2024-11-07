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
    
    // Store the password in localStorage for offline access
    if (password.length >= 8) {
      localStorage.setItem('wallet-password', password);
      toast({
        title: "Login successful",
        description: "Welcome to your Bitcoin wallet",
      });
      navigate('/');
    } else {
      toast({
        title: "Invalid password",
        description: "Password must be at least 8 characters long",
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
            Enter your password to access your wallet
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          <div className="space-y-2">
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter your password"
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
            Access Wallet
          </Button>
        </form>

        <p className="text-sm text-center text-muted-foreground mt-4">
          Your password is stored locally and used to protect your wallet
        </p>
      </div>
    </div>
  );
};

export default Login;