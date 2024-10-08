const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const PDFDocument = require('pdfkit'); // для создания PDF
const fs = require('fs'); // для работы с файловой системой
const path = require('path'); // для работы с путями файлов

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat',
  password: '2308',
  port: 5432,
});

// Логирование успешного подключения к базе данных
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to the database');
  release();
});

// Функция для генерации отчета
function generateReport(action, flightData) {
  const filePath = path.join(__dirname, 'flight_changes_report.pdf');
  const doc = new PDFDocument();

  // Проверяем, существует ли уже отчет
  if (fs.existsSync(filePath)) {
    // Если файл существует, дополняем его
    const existingData = fs.readFileSync(filePath);
    const stream = fs.createWriteStream(filePath, { flags: 'a' }); // 'a' означает "append"
    doc.pipe(stream);
  } else {
    // Если файл не существует, создаем новый
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(20).text('Отчет об изменениях в системе', { align: 'center' });
  }

  const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  doc.fontSize(12).text(`${currentDate} - ${action}: ${JSON.stringify(flightData, null, 2)}`);
  doc.end();
}

// Получение сообщений между двумя пользователями
app.get('/messages', async (req, res) => {
  const { senderId, receiverId } = req.query;

  try {
    console.log(`Fetching messages between senderId: ${senderId} and receiverId: ${receiverId}`);
    const result = await pool.query(
      `SELECT * FROM messages WHERE (sender_id = $1 AND receiver_id = $2) 
       OR (sender_id = $2 AND receiver_id = $1) ORDER BY timestamp ASC`,
      [senderId, receiverId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// Отправка сообщения
app.post('/messages', async (req, res) => {
  const { content, senderId, receiverId } = req.body;

  try {
    console.log(`Inserting message: ${content} from senderId: ${senderId} to receiverId: ${receiverId}`);
    const result = await pool.query(
      `INSERT INTO messages (content, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING *`,
      [content, senderId, receiverId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Error sending message' });
  }
});

// Логирование получения всех пользователей
app.get('/users', async (req, res) => {
  try {
    console.log('Fetching all users');
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
 
 // Получение пользователя по id
 app.get('/users/:id', async (req, res) => {
   const { id } = req.params;
   try {
     const result = await pool.query('SELECT id, name, img, role, phone, email FROM users WHERE id = $1', [id]);
     res.json(result.rows[0]);
   } catch (error) {
     console.error('Error fetching user:', error);
     res.status(500).send('Error fetching user');
   }
 });

// Логин пользователя
app.post('/login', async (req, res) => {
   const { email, password } = req.body;
 
   try {
     const result = await pool.query('SELECT id, name, img, role, phone, email FROM users WHERE email = $1 AND password = $2', [email, password]);
 
     if (result.rows.length > 0) {
       const user = result.rows[0];
       res.json(user);
     } else {
       res.status(401).json({ message: 'Неверный email или пароль' });
     }
   } catch (error) {
     console.error('Error during login:', error);
     res.status(500).send('Ошибка во время логина');
   }
 });

// Получение всех рейсов
app.get('/flights', async (req, res) => {
   try {
     const result = await pool.query('SELECT * FROM flights ORDER BY id ASC');
     res.json(result.rows);
   } catch (error) {
     console.error('Error fetching flights:', error);
     res.status(500).send('Error fetching flights');
   }
 });

// Удаление рейса по ID
app.delete('/flights/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM flights WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount > 0) {
      generateReport('Рейс удален', result.rows[0]);
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ message: 'Рейс не найден' });
    }
  } catch (error) {
    console.error('Error deleting flight:', error);
    res.status(500).send('Ошибка при удалении рейса');
  }
});

// Обновление рейса по ID
app.put('/flights/:id', async (req, res) => {
  const { id } = req.params;
  const {
    number,
    model,
    airline,
    departure_time,
    arrival_time,
    departure_town,
    arrival_town,
    departure_location,
    arrival_location,
    status
  } = req.body;

  try {
    const currentFlight = await pool.query('SELECT * FROM flights WHERE id = $1', [id]);

    if (currentFlight.rows.length === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    const updatedFlight = await pool.query(
      `UPDATE flights SET
        number = $1,
        model = $2,
        airline = $3,
        departure_time = COALESCE($4, departure_time),
        arrival_time = COALESCE($5, arrival_time),
        departure_town = $6,
        arrival_town = $7,
        departure_location = $8,
        arrival_location = $9,
        status = $10
      WHERE id = $11 RETURNING *`,
      [
        number,
        model,
        airline,
        departure_time || currentFlight.rows[0].departure_time,
        arrival_time || currentFlight.rows[0].arrival_time,
        departure_town,
        arrival_town,
        departure_location,
        arrival_location,
        status,
        id
      ]
    );
    // Генерация отчета об изменении рейса
    generateReport('Рейс изменен', updatedFlight.rows[0]);
    res.json(updatedFlight.rows[0]);
  } catch (error) {
    console.error('Error updating flight:', error);
    res.status(500).send('Error updating flight');
  }
});

// Добавление нового рейса
app.post('/flights', async (req, res) => {
  const {
    number,
    model,
    airline,
    departure_time,
    arrival_time,
    departure_town,
    arrival_town,
    departure_location,
    arrival_location,
    status
  } = req.body;

  try {
    const newFlight = await pool.query(
      `INSERT INTO flights (number, model, airline, departure_time, arrival_time, departure_town, arrival_town, departure_location, arrival_location, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        number,
        model,
        airline,
        departure_time,
        arrival_time,
        departure_town,
        arrival_town,
        departure_location,
        arrival_location,
        status
      ]
    );

    res.json(newFlight.rows[0]);
  } catch (error) {
    console.error('Error adding flight:', error);
    res.status(500).send('Error adding flight');
  }
});


