import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import type { Contract } from '../types/contract';
import type { Span } from '../types/span';
import { getContract, getSpansByTrace } from '../lib/database';
import { formatDateTime } from '../lib/utils';
import { ArrowLeft, Download } from 'lucide-react';

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Contract | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadContract(id);
    }
  }, [id]);

  async function loadContract(contractId: string) {
    try {
      const contractData = await getContract(contractId);
      const spansData = await getSpansByTrace(contractId);

      if (contractData) {
        setContract(contractData);
        setSpans(spansData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading contract:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Carregando contrato...</p>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Contrato não encontrado</p>
          <Button onClick={() => navigate('/dashboard')}>Voltar ao Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </Button>
          <h1 className="text-xl font-bold">Detalhes do Contrato</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Contract Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{contract.title}</CardTitle>
              <Badge
                variant={
                  contract.status === 'active'
                    ? 'default'
                    : contract.status === 'completed'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {contract.status === 'active' ? 'Ativo' : contract.status === 'completed' ? 'Concluído' : contract.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {contract.description && (
              <div>
                <h3 className="font-semibold mb-2">Descrição</h3>
                <p className="text-gray-700">{contract.description}</p>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Partes Envolvidas</h3>
              <div className="space-y-2">
                {contract.parties.map((party, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Badge variant="outline">{party.role}</Badge>
                    <span>{party.name}</span>
                    {party.email && <span className="text-gray-500">({party.email})</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Criado em:</span>
                <p className="font-medium">{formatDateTime(contract.created_at)}</p>
              </div>
              <div>
                <span className="text-gray-600">Atualizado em:</span>
                <p className="font-medium">{formatDateTime(contract.updated_at)}</p>
              </div>
              {contract.completed_at && (
                <div>
                  <span className="text-gray-600">Concluído em:</span>
                  <p className="font-medium">{formatDateTime(contract.completed_at)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Spans Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Spans ({spans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {spans.map((span) => (
                <div key={span.id} className="border-l-2 border-blue-500 pl-4 pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <Badge variant="outline">{span.type}</Badge>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDateTime(span.started_at)}
                      </p>
                    </div>
                    <code className="text-xs text-gray-500">{span.id.slice(0, 8)}...</code>
                  </div>

                  <p className="text-sm font-medium mb-2">{span.body.action}</p>

                  {span.body.rules && span.body.rules.length > 0 && (
                    <div className="text-sm text-gray-700">
                      <p className="font-semibold">Regras:</p>
                      <ul className="list-disc list-inside ml-2">
                        {span.body.rules.map((rule, rIdx) => (
                          <li key={rIdx}>{rule.description || rule.condition}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {span.confirmed_by && (
                    <div className="mt-2 text-xs text-gray-500">
                      ✓ Assinado por {span.confirmed_by.signer_id}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" className="flex-1">
            Compartilhar
          </Button>
        </div>
      </main>
    </div>
  );
}
