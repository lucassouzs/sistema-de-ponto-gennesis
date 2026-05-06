import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    await prisma.companySettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        name: 'Gennesis Engenharia',
        cnpj: '38.294.339/0001-10',
        address: '24, St. de Habitações Individuais Sul QI 11 - Lago Sul, Brasília - DF, 70297-400',
        phone: '(61) 99517-6932',
        email: 'contato@gennesis.com.br',
        workStartTime: '07:00',
        workEndTime: '17:00',
        lunchStartTime: '12:00',
        lunchEndTime: '13:00',
        toleranceMinutes: 10,
        maxOvertimeHours: 2,
        maxDistanceMeters: 1000,
        defaultLatitude: -15.835840,
        defaultLongitude: -47.873407,
        vacationDaysPerYear: 30
      }
    });
    console.log('✅ Configurações da empresa criadas');
  } catch (error) {
    console.error('⚠️  Erro ao criar configurações da empresa:', error);
  }

  try {
    const costCenters = [
      { code: 'SEDES', name: 'SEDES', description: 'Secretaria de Estado de Desenvolvimento Social', isActive: true },
      { code: 'SES-LOTE-10', name: 'SES - LOTE 10', description: 'Secretaria de Estado de Saúde - Lote 10', isActive: true },
      { code: 'SES-LOTE-12', name: 'SES - LOTE 12', description: 'Secretaria de Estado de Saúde - Lote 12', isActive: true },
      { code: 'SES-LOTE-14', name: 'SES - LOTE 14', description: 'Secretaria de Estado de Saúde - Lote 14', isActive: true },
      { code: 'SES-LOTE-17', name: 'SES - LOTE 17', description: 'Secretaria de Estado de Saúde - Lote 17', isActive: true },
      { code: 'FHE', name: 'FHE', description: 'Fundação Hospitalar do Estado', isActive: true },
      { code: 'CONFEA-508-NORTE', name: 'CONFEA - 508 NORTE', description: 'Conselho Federal de Engenharia e Agronomia - 508 Norte', isActive: true },
      { code: 'CONFEA-516-NORTE', name: 'CONFEA - 516 NORTE', description: 'Conselho Federal de Engenharia e Agronomia - 516 Norte', isActive: true },
      { code: 'SENAC-DF', name: 'SENAC - DF', description: 'Serviço Nacional de Aprendizagem Comercial - Distrito Federal', isActive: true },
      { code: 'RETROFIT-LOTE-1', name: 'RETROFIT - LOTE 1', description: 'Retrofit - Lote 1', isActive: true },
      { code: 'RETROFIT-LOTE-4', name: 'RETROFIT - LOTE 4', description: 'Retrofit - Lote 4', isActive: true },
      { code: 'RETROFIT-LOTE-5', name: 'RETROFIT - LOTE 5', description: 'Retrofit - Lote 5', isActive: true },
      { code: 'TJ-MANUTENCAO-CALDAS-NOVAS', name: 'TJ MANUTENÇÃO - CALDAS NOVAS', description: 'Tribunal de Justiça - Manutenção Caldas Novas', isActive: true },
      { code: 'TJ-MANUTENCAO-RIO-VERDE', name: 'TJ MANUTENÇÃO - RIO VERDE', description: 'Tribunal de Justiça - Manutenção Rio Verde', isActive: true },
      { code: 'BBGO-MANUTENCAO', name: 'BBGO MANUTENÇÃO', description: 'BBGO Manutenção', isActive: true },
      { code: 'CAPITANIA-FLUVIAL-STM-DF', name: 'CAPITANIA FLUVIAL E STM - DF', description: 'Capitania Fluvial e STM - Distrito Federal', isActive: true }
    ];

    await Promise.all(
      costCenters.map(costCenter =>
        prisma.costCenter.upsert({
          where: { code: costCenter.code },
          update: {
            name: costCenter.name,
            description: costCenter.description,
            isActive: costCenter.isActive
          },
          create: costCenter
        })
      )
    );
    console.log('✅ Centros de custo criados');
  } catch (error) {
    console.error('⚠️  Erro ao criar centros de custo:', error);
  }

  try {
    const [materialCategory, laborCategory, equipmentCategory] = await Promise.all([
      prisma.materialCategory.upsert({
        where: { code: 'MAT' },
        update: {},
        create: {
          code: 'MAT',
          name: 'Materiais',
          description: 'Materiais de construção e engenharia'
        }
      }),
      prisma.materialCategory.upsert({
        where: { code: 'MO' },
        update: {},
        create: {
          code: 'MO',
          name: 'Mão de Obra',
          description: 'Mão de obra especializada e não especializada'
        }
      }),
      prisma.materialCategory.upsert({
        where: { code: 'EQP' },
        update: {},
        create: {
          code: 'EQP',
          name: 'Equipamentos',
          description: 'Equipamentos e ferramentas'
        }
      })
    ]);

    console.log('✅ Categorias de materiais criadas');

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const exampleMaterials = [
      { sinapiCode: '88.01.01', description: 'CIMENTO PORTLAND COMUM CP I - SACO 50KG', unit: 'KG', medianPrice: 0.45, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: materialCategory.id },
      { sinapiCode: '88.02.01', description: 'AREIA MÉDIA - M³', unit: 'M3', medianPrice: 85.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: materialCategory.id },
      { sinapiCode: '88.03.01', description: 'BRITA 1 - M³', unit: 'M3', medianPrice: 120.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: materialCategory.id },
      { sinapiCode: '88.04.01', description: 'FERRO CA-50 10MM - T', unit: 'T', medianPrice: 4500.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: materialCategory.id },
      { sinapiCode: '88.05.01', description: 'TELHA CERÂMICA - MILHEIRO', unit: 'MIL', medianPrice: 850.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: materialCategory.id },
      { sinapiCode: '74.01.01', description: 'PEDREIRO - H', unit: 'H', medianPrice: 25.50, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: laborCategory.id },
      { sinapiCode: '74.02.01', description: 'CARPINTEIRO - H', unit: 'H', medianPrice: 28.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: laborCategory.id },
      { sinapiCode: '74.03.01', description: 'ENCANADOR - H', unit: 'H', medianPrice: 30.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: laborCategory.id },
      { sinapiCode: '74.04.01', description: 'ELETRICISTA - H', unit: 'H', medianPrice: 32.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: laborCategory.id },
      { sinapiCode: '74.05.01', description: 'ARMADOR - H', unit: 'H', medianPrice: 27.50, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: laborCategory.id },
      { sinapiCode: '91.01.01', description: 'BETONEIRA 400L - DIA', unit: 'DIA', medianPrice: 85.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: equipmentCategory.id },
      { sinapiCode: '91.02.01', description: 'GUINDASTE - DIA', unit: 'DIA', medianPrice: 450.00, state: 'DF', referenceMonth: currentMonth, referenceYear: currentYear, categoryId: equipmentCategory.id }
    ];

    await Promise.all(
      exampleMaterials.map(material =>
        prisma.engineeringMaterial.upsert({
          where: { sinapiCode: material.sinapiCode },
          update: {
            description: material.description,
            unit: material.unit,
            medianPrice: material.medianPrice,
            state: material.state,
            referenceMonth: material.referenceMonth,
            referenceYear: material.referenceYear
          },
          create: material
        })
      )
    );

    console.log('✅ Materiais de exemplo criados');
  } catch (error) {
    console.error('⚠️  Erro ao criar materiais de exemplo:', error);
  }
  
  console.log('✅ Seed concluído com sucesso');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });