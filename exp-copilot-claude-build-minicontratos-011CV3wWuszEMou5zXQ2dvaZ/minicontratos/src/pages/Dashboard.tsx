import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import type { Contract } from '../types/contract';
import { getAllContracts, getSpanCount, getCurrentSession } from '../lib/database';
import { formatDate } from '../lib/utils';
import { Plus, FileText, CheckCircle, Archive, Database, User } from 'lucide-react';

export function Dashboard() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [spanCount, setSpanCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Check if logged in
      const session = await getCurrentSession();
      if (!session) {
        navigate('/');
        return;
      }

      // Load contracts and stats
      const allContracts = await getAllContracts();
      const count = await getSpanCount();

      setContracts(allContracts);
      setSpanCount(count);
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  }

  const activeContracts = contracts.filter((c) => c.status === 'active').length;
  const completedContracts = contracts.filter((c) => c.status === 'completed').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
              m
            </div>
            <h1 className="text-xl font-bold">minicontratos</h1>
          </div>

          <Button variant="ghost" size="icon">
            <User className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Card */}
        <Card className="mb-8 bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-8">
            <h2 className="text-3xl font-bold mb-2">Criar Novo Contrato</h2>
            <p className="text-blue-100 mb-6">
              Descreva em português o que você precisa. O sistema cria o contrato verificável para você.
            </p>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => navigate('/create')}
              className="bg-white text-blue-600 hover:bg-blue-50"
            >
              <Plus className="w-5 h-5 mr-2" />
              Novo Contrato
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Contratos</p>
                  <p className="text-2xl font-bold">{contracts.length}</p>
                </div>
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Ativos</p>
                  <p className="text-2xl font-bold text-green-600">{activeContracts}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Concluídos</p>
                  <p className="text-2xl font-bold text-blue-600">{completedContracts}</p>
                </div>
                <Archive className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Spans no Ledger</p>
                  <p className="text-2xl font-bold text-purple-600">{spanCount}</p>
                </div>
                <Database className="w-8 h-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contracts List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Seus Contratos</h2>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-600">Carregando contratos...</p>
              </CardContent>
            </Card>
          ) : contracts.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum contrato ainda</h3>
                <p className="text-gray-600 mb-6">Crie seu primeiro contrato verificável!</p>
                <Button onClick={() => navigate('/create')}>
                  <Plus className="w-5 h-5 mr-2" />
                  Criar Primeiro Contrato
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {contracts.map((contract) => (
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ContractCard({ contract }: { contract: Contract }) {
  const navigate = useNavigate();

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/contract/${contract.id}`)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold">{contract.title}</h3>
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

            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <span>👥 {contract.parties.length} partes</span>
              <span>📅 {formatDate(contract.created_at)}</span>
              <span>🔗 {contract.spans.length} spans</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {contract.parties.map((party, idx) => (
                <div key={idx} className="flex items-center gap-1 text-sm">
                  <User className="w-4 h-4" />
                  <span>{party.name}</span>
                  <span className="text-gray-400">({party.role})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
