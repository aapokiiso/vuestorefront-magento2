import {
  Ref, ref, computed, useContext,
} from '@nuxtjs/composition-api';
import { useCustomerStore } from '~/stores/customer';
import { generateUserData } from '~/composables/helpers/customer/userDataGenerator';
import { UseUser } from '~/composables/useUser/useUser';
import useApiClient from '~/composables/useApiClient';
import updateCustomerEmailQuery from '~/api/updateCustomerEmail';
import updateCustomerQuery from '~/api/updateCustomer';
import revokeCustomerTokenQuery from '~/api/revokeCustomerToken';
import customerQuery from '~/api/customer';
import customerCartQuery from '~/api/customerCart';
import mergeCartsQuery from '~/api/mergeCarts';
import generateCustomerTokenQuery from '~/api/generateCustomerToken';
import createCustomerMutation from '~/api/createCustomer';
import changeCustomerPasswordMutation from "~/api/changeCustomerPassword";
import cookieNames from '~/enums/cookieNameEnum';

export const useUser = (): UseUser => {
  const customerStore = useCustomerStore();
  const { app } = useContext();
  const loading: Ref<boolean> = ref(false);
  const isAuthenticated = computed(() => Boolean(customerStore.user?.firstname));
  const errorsFactory = () => ({
    updateUser: null,
    register: null,
    login: null,
    logout: null,
    changePassword: null,
    load: null,
  });
  const error: Ref = ref(errorsFactory());
  const { request } = useApiClient();

  const setUser = (newUser) => {
    customerStore.user = newUser;
    // Logger.debug('useUserFactory.setUser', newUser);
  };

  const resetErrorValue = () => {
    error.value = errorsFactory();
  };

  // eslint-disable-next-line consistent-return
  const updateUser = async ({ user: providedUser }) => {
    // Logger.debug('[Magento] Update user information', { providedUser, customQuery });
    resetErrorValue();
    try {
      loading.value = true;
      const { email: oldEmail } = customerStore.user;
      const { email, password, ...updateData } = providedUser;

      const userData = generateUserData(updateData);

      if (email && email !== oldEmail) {
        await request(updateCustomerEmailQuery, {
          email,
          password,
        });
      }

      const { data, errors } = await request(updateCustomerQuery, userData);
      // Logger.debug('[Result]:', { data });

      if (errors) {
        console.log(errors);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        // Logger.error(errors.map((e) => e.message).join(','));
      }

      customerStore.user = data?.updateCustomerV2?.customer || {};
      error.value.updateUser = null;
    } catch (err) {
      error.value.updateUser = err;
      // Logger.error('useUser/updateUser', err);
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    // Logger.debug('[Magento] useUserFactory.logout');
    resetErrorValue();

    try {
      await request(revokeCustomerTokenQuery);
      app.$cookies.set(cookieNames.customerCookieName, null);
      app.$cookies.set(cookieNames.cartCookieName, null);
      customerStore.cart(null);
      customerStore.user = null;
      error.value.logout = null;
    } catch (err) {
      error.value.logout = err;
      // Logger.error('useUser/logout', err);
    }
  };

  const load = async () => {
    // Logger.debug('[Magento] useUser.load');
    resetErrorValue();

    try {
      loading.value = true;
      if (!app.$cookies.get(cookieNames.customerCookieName)) {
        return null;
      }

      try {
        const data = await request(customerQuery);
        console.log(data, 'CUSTOMER');
        // Logger.debug('[Result]:', { data });

        customerStore.user = data?.customer ?? {};
      } catch {
        // eslint-disable-next-line no-void
        // @ts-ignore
        await logout();
      }
      error.value.load = null;
    } catch (err) {
      error.value.load = err;
      // Logger.error('useUser/load', err);
    } finally {
      loading.value = false;
    }

    return customerStore.user;
  };

  // eslint-disable-next-line @typescript-eslint/require-await,no-empty-pattern
  const login = async ({ user }) => {
    // Logger.debug('[Magento] useUser.login', providedUser);
    resetErrorValue();
    try {
      loading.value = true;

      console.log(user);
      const data = await request(
        generateCustomerTokenQuery,
        {
          email: user.email,
          password: user.password,
          // recaptchaToken: providedUser.recaptchaToken,
        },
      );

      // Logger.debug('[Result]:', { data });

      if (!data.generateCustomerToken || !data.generateCustomerToken.token) {
        // Logger.error('Customer sign-in error'); // todo: handle errors in better way
      }

      app.$cookies.set(cookieNames.customerCookieName, data.generateCustomerToken.token);

      // merge existing cart with customer cart
      // todo: move this logic to separate method
      const currentCartId = app.$cookies.get(cookieNames.cartCookieName);
      const cart = await request(customerCartQuery);
      const newCartId = cart.customerCart.id;
      if (newCartId && currentCartId && currentCartId !== newCartId) {
        const dataMergeCart = await request(
          mergeCartsQuery,
          {
            sourceCartId: currentCartId,
            destinationCartId: newCartId,
          },
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        customerStore.cart = dataMergeCart.mergeCarts;
        app.$cookies.set(cookieNames.cartCookieName, dataMergeCart.mergeCarts.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        app.$cookies.set(cookieNames.cartCookieName, cart.customerCart.id);
      }

      error.value.login = null;
      customerStore.user = await load();

      return customerStore.user;
    } catch (err) {
      error.value.login = err;
      console.log('error', err);
      // Logger.error('useUser/login', err);
    } finally {
      loading.value = false;
    }

    return customerStore.user;
  };

  // eslint-disable-next-line consistent-return
  const register = async ({ user: providedUser, customQuery }) => {
    // Logger.debug('[Magento] useUser.register', providedUser);
    resetErrorValue();

    try {
      loading.value = true;

      const {
        email,
        password,
        recaptchaToken,
        ...baseData
      } = generateUserData(providedUser);

      console.log(email, password)

      const data = await request(
        createCustomerMutation,
        {
          input: {
            email,
            password,
            recaptchaToken,
            ...baseData,
          },
        },
      );

      // Logger.debug('[Result]:', { data });

      // if (errors) {
      //   // Logger.error(errors.map((e) => e.message).join(','));
      // }

      if (!data || !data.createCustomerV2 || !data.createCustomerV2.customer) {
        // Logger.error('Customer registration error'); // todo: handle errors in better way
      }

      // if (recaptchaToken) { // todo: move recaptcha to separate module
      //   // generate a new token for the login action
      //   const { recaptchaInstance } = params;
      //   const newRecaptchaToken = await recaptchaInstance.getResponse();
      //
      //   return factoryParams.logIn(context, { username: email, password, recaptchaToken: newRecaptchaToken });
      // }
      error.value.register = null;
      console.log(data, email, password)
      customerStore.user = await login({ user: { email, password }});

      return customerStore.user;
    } catch (err) {
      error.value.register = err;
      // Logger.error('useUser/register', err);
      console.log('register error', err)
    } finally {
      loading.value = false;
    }
  };

  // eslint-disable-next-line consistent-return
  const changePassword = async (params) => {
    // Logger.debug('[Magento] useUser.changePassword', { currentPassword: mask(params.current), newPassword: mask(params.new) });
    resetErrorValue();

    try {
      loading.value = true;

      const data = await request(changeCustomerPasswordMutation, {
        currentUser: customerStore.user,
        currentPassword: params.current,
        newPassword: params.new,
        customQuery: params.customQuery,
      });

      // if (errors) {
      //   // Logger.error(errors.map((e) => e.message).join(','));
      // }

      // Logger.debug('[Result] ', { data });

      customerStore.user = data?.changeCustomerPassword;
      error.value.changePassword = null;
    } catch (err) {
      error.value.changePassword = err;
      // Logger.error('useUser/changePassword', err);
      console.log('error', err)
    } finally {
      loading.value = false;
    }
  };

  return {
    user: computed(() => customerStore.user),
    loading,
    isAuthenticated,
    error,
    setUser,
    updateUser,
    register,
    login,
    logout,
    changePassword,
    load,
  };
};

export default useUser;