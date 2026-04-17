import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export function useMeiosPagamento() {
  const [meios, setMeios] = useState([]);
  const [loading, setLoading] = useState(false);

  // Busca os cartões e contas cadastrados
  const fetchMeios = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'fin_meios_pagamento'));
      const dados = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeios(dados);
    } catch (error) {
      console.error("Erro ao buscar meios de pagamento:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeios();
  }, []);

  // Salva um novo cartão (Apenas dados seguros)
  const adicionarMeio = async (dados) => {
    try {
      const novoMeio = {
        ...dados,
        limiteUsado: 0, // Começa zerado
        limiteDisponivel: dados.limiteTotal, // Disponível = Total
        createdAt: serverTimestamp(),
        ativo: true
      };
      
      const docRef = await addDoc(collection(db, 'fin_meios_pagamento'), novoMeio);
      setMeios(prev => [...prev, { id: docRef.id, ...novoMeio }]);
      return { success: true };
    } catch (error) {
      console.error("Erro ao adicionar meio de pagamento:", error);
      return { success: false, error };
    }
  };

  return { meios, loading, adicionarMeio, fetchMeios };
}