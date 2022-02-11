import {
  Logger,
  ComposableFunctionArgs,
} from '@vue-storefront/core';

import {
  ref, computed, useContext,
} from '@nuxtjs/composition-api';
import { UseCurrency, UseCurrencyErrors } from '~/_old/composables/useCurrency/useCurrency';
import { useConfigStore } from '~/_old/stores/config';

const useCurrency = (): UseCurrency => {
  const { app } = useContext();
  const loading = ref(false);
  const error = ref<UseCurrencyErrors>({ load: null, change: null });
  const configStore = useConfigStore();
  const currency = computed(() => configStore.currency);

  const load = async (params?: ComposableFunctionArgs<{}>) => {
    error.value.load = null;
    loading.value = true;

    Logger.debug('useCurrency/load');

    try {
      const { data } = await app.$vsf.$magento.api.currency(params);
      configStore.$patch((state) => {
        state.currency = data?.currency ?? {};
      });
    } catch (err) {
      Logger.debug('[ERROR] useCurrency/load', err);
      error.value.load = err;
    } finally {
      loading.value = false;
    }
  };

  const change = async (params: ComposableFunctionArgs<{ id: string }>) => {
    error.value.change = null;
    loading.value = true;

    Logger.debug('useCurrency/change');

    try {
      await app.$vsf.$magento.config.state.setCurrency(params.id);
    } catch (err) {
      Logger.debug('[ERROR] useCurrency/change', err);
      error.value.change = err;
    } finally {
      loading.value = false;
    }
  };

  return {
    load,
    change,
    currency,
    loading,
    error,
  };
};

export default useCurrency;