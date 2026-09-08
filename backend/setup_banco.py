import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'empresa.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE IF NOT EXISTS empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        segmento TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
''')
cursor.execute('''
    INSERT OR IGNORE INTO empresas (id, nome, segmento)
    VALUES (1, 'Minha Empresa', 'Negócios')
''')

# Tabela Financeira
cursor.execute('''
    CREATE TABLE IF NOT EXISTS financeiro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes TEXT NOT NULL,
        faturamento REAL NOT NULL,
        despesas REAL NOT NULL,
        lucro REAL NOT NULL,
        empresa_id INTEGER NOT NULL DEFAULT 1
    )
''')

# Tabela de Estoque
cursor.execute('''
    CREATE TABLE IF NOT EXISTS estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT NOT NULL,
        quantidade INTEGER NOT NULL,
        preco_unitario REAL NOT NULL,
        empresa_id INTEGER NOT NULL DEFAULT 1
    )
''')

# Limpa registros antigos para evitar duplicatas ao rodar novamente
cursor.execute('DELETE FROM financeiro')
cursor.execute('DELETE FROM estoque')

# Registros de Teste
cursor.executemany('''
    INSERT INTO financeiro (mes, faturamento, despesas, lucro, empresa_id) VALUES (?, ?, ?, ?, 1)
''', [
    ('Janeiro', 150000.00, 90000.00, 60000.00),
    ('Fevereiro', 180000.00, 95000.00, 85000.00),
    ('Março', 210000.00, 100000.00, 110000.00)
])

cursor.executemany('''
    INSERT INTO estoque (produto, quantidade, preco_unitario, empresa_id) VALUES (?, ?, ?, 1)
''', [
    ('Notebook Executivo S3', 45, 4500.00),
    ('Monitor UltraWide 27', 120, 1200.00),
    ('Teclado Mecânico Corporate', 80, 350.00)
])

conn.commit()
conn.close()
print(f"✅ Banco de dados 'empresa.db' criado com sucesso em: {db_path}")