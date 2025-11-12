import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Textarea } from '../components/ui/Textarea';
import { Badge } from '../components/ui/Badge';
import type { Span } from '../types/span';
import type { Message } from '../types/llm';
import { callLLM, extractSpansFromResponse } from '../lib/llm';
import { getCurrentSession } from '../lib/database';
import { appendToLedger, updateContractFromSpans } from '../lib/ledger';
import { calculateSpanHash } from '../lib/crypto';
import { ArrowLeft, Send, Loader2, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const TEMPLATES = {
  freelance: `Contrato de prestação de serviços:
- Freelancer entrega logo completo
- Cliente paga R$ 2.000 após aprovação
- Prazo de 30 dias para entrega
- 2 rodadas de revisão incluídas
- Multa de 2% + juros de 1% ao mês em caso de atraso no pagamento`,
  loan: `Empréstimo entre amigos:
- João empresta R$ 5.000 para Maria
- Maria paga em 12 parcelas de R$ 450
- Vencimento: dia 5 de cada mês
- Juros de 2% ao mês sobre o saldo devedor
- Multa de 10% em caso de atraso`,
  sale: `Venda de produto:
- Vendedor: João
- Comprador: Maria
- Produto: Macbook Pro 2024
- Valor: R$ 12.000
- Pagamento: 50% entrada + 50% na entrega
- Garantia: 30 dias`,
};

export function CreateContract() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [generatedSpans, setGeneratedSpans] = useState<Span[]>([]);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!description.trim()) return;

    setGenerating(true);
    setError('');

    // Add user message to conversation
    const userMessage: Message = { role: 'user', content: description };
    const newConversation = [...conversation, userMessage];
    setConversation(newConversation);

    try {
      // Get session config
      const session = await getCurrentSession();
      if (!session || !session.api_key) {
        setError('Sessão expirada. Por favor, faça login novamente.');
        navigate('/');
        return;
      }

      // Call LLM
      const response = await callLLM(
        description,
        {
          provider: session.provider!,
          apiKey: session.api_key,
          model: session.model || '',
        },
        newConversation.filter((m) => m.role !== 'system')
      );

      // Add assistant response
      const assistantMessage: Message = { role: 'assistant', content: response };
      setConversation([...newConversation, assistantMessage]);

      // Extract spans from response
      const spans = extractSpansFromResponse(response);
      if (spans.length > 0) {
        // Calculate hashes for spans that don't have them
        for (const span of spans) {
          if (!span.this.hash) {
            span.this.hash = await calculateSpanHash(span);
          }
        }
        setGeneratedSpans(spans);
      }

      setGenerating(false);
      setDescription('');
    } catch (err) {
      console.error('Error generating contract:', err);
      setError('Erro ao gerar contrato. Tente novamente.');
      setGenerating(false);
    }
  }

  async function saveContract() {
    if (generatedSpans.length === 0) return;

    try {
      setGenerating(true);

      // Append all spans to ledger
      for (const span of generatedSpans) {
        await appendToLedger(span);
      }

      // Update contract view
      const contractId = generatedSpans[0].trace_id;
      await updateContractFromSpans(contractId);

      alert('✓ Contrato criado com sucesso!');
      navigate(`/contract/${contractId}`);
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Erro ao salvar contrato.');
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </Button>
          <h1 className="text-xl font-bold">Criar Contrato</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>📝 Descreva seu contrato</CardTitle>
            <CardDescription>
              Escreva em português natural. Nosso assistente vai te ajudar a criar um contrato completo e verificável.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Templates */}
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => setDescription(TEMPLATES.freelance)}
              >
                💼 Freelance
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => setDescription(TEMPLATES.loan)}
              >
                💰 Empréstimo
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => setDescription(TEMPLATES.sale)}
              >
                🛒 Venda
              </Badge>
            </div>

            {/* Conversation area */}
            <div className="border rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto space-y-4 bg-gray-50">
              {conversation.length === 0 ? (
                <p className="text-gray-400 text-center">
                  Comece descrevendo o contrato que você precisa...
                </p>
              ) : (
                conversation.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-900 border'
                      }`}
                    >
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                ))
              )}

              {generating && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-lg p-3 border">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Ex: João deve pagar R$ 1.000 para Maria até 25/12/2025..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                rows={3}
                className="flex-1"
              />
              <Button
                onClick={handleSubmit}
                disabled={!description.trim() || generating}
                size="lg"
              >
                {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
          </CardContent>
        </Card>

        {/* Generated Spans Preview */}
        {generatedSpans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>✅ Contrato Gerado</CardTitle>
              <CardDescription>Revise os detalhes antes de confirmar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedSpans.map((span, idx) => (
                <SpanPreview key={idx} span={span} index={idx + 1} />
              ))}

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setGeneratedSpans([])}
                  className="flex-1"
                >
                  Refazer
                </Button>
                <Button onClick={saveContract} disabled={generating} className="flex-1">
                  <Check className="w-5 h-5 mr-2" />
                  {generating ? 'Salvando...' : 'Confirmar e Criar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function SpanPreview({ span, index }: { span: Span; index: number }) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge>{index}</Badge>
          <code className="text-sm font-mono">{span.type}</code>
        </div>
        <Badge variant="outline">{span.entity}</Badge>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <span className="font-semibold">Ação:</span> <span>{span.body.action}</span>
        </div>

        {span.body.rules && span.body.rules.length > 0 && (
          <div>
            <span className="font-semibold">Regras:</span>
            <ul className="list-disc list-inside ml-4 mt-1">
              {span.body.rules.map((rule, idx) => (
                <li key={idx} className="text-gray-700">
                  {rule.description || rule.condition}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={() => setShowJson(!showJson)}
          className="text-blue-600 hover:underline text-sm"
        >
          {showJson ? 'Esconder' : 'Ver'} JSON completo
        </button>

        {showJson && (
          <pre className="mt-2 p-2 bg-gray-900 text-gray-100 rounded text-xs overflow-x-auto">
            {JSON.stringify(span, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
