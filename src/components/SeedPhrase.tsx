import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface SeedPhraseProps {
  words: string[];
}

const SeedPhrase = ({ words }: SeedPhraseProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const { toast } = useToast();

  const downloadSeedPhrase = () => {
    const content = words.join(' ');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seed-phrase.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Seed phrase downloaded",
      description: "Keep it in a safe place!",
    });
  };

  return (
    <Card className="seed-phrase p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-heading font-semibold text-primary">Recovery Phrase</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsVisible(!isVisible)}
          >
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={downloadSeedPhrase}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {words.map((word, index) => (
          <div
            key={index}
            className="bg-secondary p-2 rounded text-sm flex items-center gap-2"
          >
            <span className="text-muted-foreground">{index + 1}.</span>
            <span className="font-mono">
              {isVisible ? word : '••••••'}
            </span>
          </div>
        ))}
      </div>

      {!isVisible && (
        <p className="text-sm text-muted-foreground text-center">
          Click the eye icon to reveal your seed phrase
        </p>
      )}
    </Card>
  );
};

export default SeedPhrase;