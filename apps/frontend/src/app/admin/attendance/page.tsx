'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowLeft,
  Download,
  Search,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface AttendanceRecord {
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'partial';
  entryTime?: string;
  exitTime?: string;
  workedHours?: number;
  expectedHours?: number;
  overtime?: number;
  notes?: string[];
}

export default function AttendancePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  // Buscar relatório de frequência
  const { data: attendanceData, isLoading } = useQuery({
    queryKey: ['attendance-report', selectedDate],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/admin/attendance?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Erro ao buscar relatório de frequência');
      return response.json();
    }
  });

  const attendanceRecords = attendanceData?.data || [];
  
  const filteredRecords = attendanceRecords.filter((record: AttendanceRecord) =>
    record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: attendanceRecords.length,
    present: attendanceRecords.filter((r: AttendanceRecord) => r.status === 'present').length,
    absent: attendanceRecords.filter((r: AttendanceRecord) => r.status === 'absent').length,
    late: attendanceRecords.filter((r: AttendanceRecord) => r.status === 'late').length,
    partial: attendanceRecords.filter((r: AttendanceRecord) => r.status === 'partial').length,
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      present: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Presente' },
      absent: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Ausente' },
      late: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Atrasado' },
      partial: { color: 'bg-orange-100 text-orange-800', icon: TrendingDown, label: 'Parcial' },
    };
    
    const variant = variants[status as keyof typeof variants] || variants.absent;
    const Icon = variant.icon;
    
    return (
      <Badge className={`${variant.color} flex items-center space-x-1`}>
        <Icon className="w-3 h-3" />
        <span>{variant.label}</span>
      </Badge>
    );
  };

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const excelData = [
        ['Relatório de Frequência', '', '', '', '', '', ''],
        ['Data:', selectedDate, '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['Matrícula', 'Nome', 'Departamento', 'Cargo', 'Status', 'Entrada', 'Saída', 'Horas Trabalhadas', 'Observações'],
        ...filteredRecords.map((record: AttendanceRecord) => [
          record.employeeId,
          record.employeeName,
          record.department,
          record.position,
          record.status === 'present' ? 'Presente' : 
          record.status === 'absent' ? 'Ausente' :
          record.status === 'late' ? 'Atrasado' : 'Parcial',
          record.entryTime || '--:--',
          record.exitTime || '--:--',
          record.workedHours || 0,
          record.notes?.join(', ') || ''
        ])
      ];

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      ws['!cols'] = [
        { width: 12 }, { width: 20 }, { width: 15 }, { width: 15 },
        { width: 12 }, { width: 10 }, { width: 10 }, { width: 15 }, { width: 30 }
      ];
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Frequência');
      
      const fileName = `frequencia_${selectedDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      toast.error('Erro ao exportar relatório');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Relatórios de Frequência</h1>
                <p className="mt-2 text-gray-600">Visualize a frequência de todos os funcionários</p>
              </div>
            </div>
            <Button
              onClick={exportToExcel}
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Excel</span>
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Funcionário</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Nome, matrícula ou departamento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => setSelectedEmployee(null)}
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Presentes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.present}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-red-100 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Ausentes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.absent}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Atrasados</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.late}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <TrendingDown className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Parciais</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.partial}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de funcionários */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">
              Frequência - {new Date(selectedDate).toLocaleDateString('pt-BR')}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Funcionário
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Departamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entrada
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Saída
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Horas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Observações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRecords.map((record: AttendanceRecord) => (
                    <tr key={`${record.employeeId}-${record.date}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{record.employeeName}</div>
                          <div className="text-sm text-gray-500">#{record.employeeId}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{record.department}</div>
                        <div className="text-sm text-gray-500">{record.position}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.entryTime || '--:--'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.exitTime || '--:--'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.workedHours || 0}h
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {record.notes?.join(', ') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRecords.length === 0 && (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum registro encontrado</h3>
                <p className="text-gray-600">
                  {searchTerm ? 'Tente ajustar os filtros de busca.' : 'Nenhum funcionário encontrado para esta data.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
