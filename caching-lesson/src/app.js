import express from 'express';
import productRouter from './services/productService.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use('/api/test', (req, res) => {
  res.json({ message: 'Hello from the API!' });
});

app.use('/products', productRouter);

export default app;