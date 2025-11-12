import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { saveUser, saveCredential, saveIdentity, saveSession } from '../lib/database';
import { encryptApiKey, generateKeyPair, exportPublicKey, sanitizeName, generateShortId } from '../lib/crypto';
import { testApiKey, detectProvider } from '../lib/llm';
import { DEFAULT_MODELS } from '../types/llm';
import { createUserRegistrationSpan } from '../lib/ledger';
import { appendToLedger } from '../lib/ledger';

type OnboardingStep = 'welcome' | 'name' | 'apikey' | 'email' | 'complete';

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama'>('anthropic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleNameSubmit() {
    if (!name.trim()) {
      setError('Por favor, digite seu nome');
      return;
    }
    setError('');
    setStep('apikey');
  }

  async function handleApiKeySubmit() {
    if (!apiKey.trim()) {
      setError('Por favor, cole sua chave API');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Detect provider
      const detectedProvider = detectProvider(apiKey);
      setProvider(detectedProvider);

      // Test API key
      const isValid = await testApiKey(apiKey, detectedProvider);
      if (!isValid) {
        setError('Chave API inválida. Verifique e tente novamente.');
        setLoading(false);
        return;
      }

      // Create user ID
      const userId = `user-${sanitizeName(name)}-${generateShortId()}`;

      // Save user
      await saveUser({
        id: userId,
        name: name.trim(),
        created_at: new Date().toISOString(),
      });

      // Encrypt and save credentials
      const encryptedKey = await encryptApiKey(apiKey, userId);
      await saveCredential({
        user_id: userId,
        encrypted_key: encryptedKey,
        provider: detectedProvider,
        model: DEFAULT_MODELS[detectedProvider],
        created_at: new Date().toISOString(),
      });

      // Generate cryptographic identity
      const keyPair = await generateKeyPair();
      const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
      await saveIdentity({
        id: 'self',
        user_id: userId,
        public_key: publicKeyJwk,
        private_key_handle: keyPair.privateKey,
        created_at: new Date().toISOString(),
      });

      // Create session
      await saveSession({
        user_id: userId,
        started_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        api_key: apiKey,
        provider: detectedProvider,
        model: DEFAULT_MODELS[detectedProvider],
      });

      // Create registration span
      const registrationSpan = createUserRegistrationSpan(userId, name.trim());
      await appendToLedger(registrationSpan);

      setLoading(false);
      setStep('email');
    } catch (err) {
      console.error('Onboarding error:', err);
      setError('Erro ao configurar conta. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleEmailSubmit() {
    // Email is optional, just go to dashboard
    navigate('/dashboard');
  }

  function handleSkipEmail() {
    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        {step === 'welcome' && (
          <>
            <CardHeader>
              <CardTitle className="text-3xl text-center">
                Bem-vindo ao minicontratos
              </CardTitle>
              <CardDescription className="text-center text-lg">
                Contratos em português que executam sozinhos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">O que você pode fazer:</h3>
                <ul className="space-y-2 text-sm">
                  <li>✅ Criar contratos em português natural</li>
                  <li>✅ Assinatura digital criptográfica</li>
                  <li>✅ Prova matemática de autenticidade</li>
                  <li>✅ Execução automática de regras</li>
                  <li>✅ 100% no seu dispositivo, 100% privado</li>
                </ul>
              </div>
              <Button onClick={() => setStep('name')} className="w-full">
                Começar
              </Button>
            </CardContent>
          </>
        )}

        {step === 'name' && (
          <>
            <CardHeader>
              <CardTitle>Oi! Como você se chama?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Input
                  placeholder="Seu nome..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
                  autoFocus
                />
                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              </div>
              <Button onClick={handleNameSubmit} disabled={!name.trim()} className="w-full">
                Continuar →
              </Button>
            </CardContent>
          </>
        )}

        {step === 'apikey' && (
          <>
            <CardHeader>
              <CardTitle>Legal, {name}! 👋</CardTitle>
              <CardDescription>
                Para funcionar, preciso que você cole uma chave de API de algum provedor LLM.
                <br /><br />
                <strong>Não se preocupe</strong>: sua chave fica 100% no seu dispositivo,
                nunca enviamos para nossos servidores!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Escolha um provedor:</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={provider === 'anthropic' ? 'default' : 'outline'}
                    onClick={() => setProvider('anthropic')}
                    size="sm"
                  >
                    Anthropic
                  </Button>
                  <Button
                    variant={provider === 'openai' ? 'default' : 'outline'}
                    onClick={() => setProvider('openai')}
                    size="sm"
                  >
                    OpenAI
                  </Button>
                  <Button
                    variant={provider === 'ollama' ? 'default' : 'outline'}
                    onClick={() => setProvider('ollama')}
                    size="sm"
                  >
                    Ollama
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {provider === 'anthropic' && (
                  <>
                    <p className="text-sm text-gray-600">
                      Recomendado! Claude é excelente para contratos.
                    </p>
                    <Input
                      type="password"
                      placeholder="sk-ant-api03-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline block"
                    >
                      Não tem uma chave? Crie grátis (5 min) →
                    </a>
                  </>
                )}

                {provider === 'openai' && (
                  <>
                    <p className="text-sm text-gray-600">
                      GPT-4 também funciona bem!
                    </p>
                    <Input
                      type="password"
                      placeholder="sk-proj-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline block"
                    >
                      Criar chave OpenAI →
                    </a>
                  </>
                )}

                {provider === 'ollama' && (
                  <>
                    <p className="text-sm text-gray-600">
                      Para rodar modelos localmente (grátis!)
                    </p>
                    <Input
                      placeholder="http://localhost:11434"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <a
                      href="https://ollama.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline block"
                    >
                      Instalar Ollama →
                    </a>
                  </>
                )}

                {error && <p className="text-red-600 text-sm">{error}</p>}
              </div>

              <Button
                onClick={handleApiKeySubmit}
                disabled={!apiKey.trim() || loading}
                className="w-full"
              >
                {loading ? 'Validando...' : 'Validar e Continuar →'}
              </Button>
            </CardContent>
          </>
        )}

        {step === 'email' && (
          <>
            <CardHeader>
              <CardTitle>Quase lá! 🎉</CardTitle>
              <CardDescription>
                (Opcional) Cadastre um email para recuperar acesso caso perca sua chave.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkipEmail} className="flex-1">
                  Pular
                </Button>
                <Button onClick={handleEmailSubmit} disabled={!email.trim()} className="flex-1">
                  Salvar e Começar
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
