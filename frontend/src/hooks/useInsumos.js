import { useState, useCallback } from 'react';
import { collection, getDocs, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const useInsumos = () => {
  const [loading, setLoading] = useState(false);

  const getInsumos = useCallback(async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'insumos'));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Erro ao buscar insumos:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const addInsumo = async (dadosInsumo) => {
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'insumos'), {
        ...dadosInsumo,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error("Erro ao adicionar insumo:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateInsumo = async (id, dadosAtualizados) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'insumos', id);
      await updateDoc(docRef, {
        ...dadosAtualizados,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Erro ao atualizar insumo:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // NOVA FUNÇÃO: Apagar um documento
  const deleteInsumo = async (id) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'insumos', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Erro ao deletar insumo:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Não esqueça de exportar a nova função aqui no final!
  return { getInsumos, addInsumo, updateInsumo, deleteInsumo, loading };
};