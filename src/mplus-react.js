import React from "react";
import flyd from "flyd";
import md5 from "js-md5";
import PropTypes from "prop-types";

const kont = {};

const hash = (value) => {
  const _value = [];
  for (const k in value) {
    if (
      typeof value[k] == "undefined" ||
      typeof value[k] == "function" ||
      value[k] === null
    )
      continue;

    if (typeof value[k] == "object" && value[k].getId) {
      _value.push(k);
      _value.push(value[k].getId()); // MaximoPlus object
    } else {
      _value.push(k);
      _value.push(value[k]);
    }
  }

  return md5(JSON.stringify(_value));
};

const difference = (a1, a2) => {
  const result = [];
  for (let i = 0; i < a1.length; i++) {
    if (a2.indexOf(a1[i]) === -1) {
      result.push(a1[i]);
    }
  }
  return result;
};

const isCordovaApp = !!window.cordova;

const dialogRefInnerIds = [];
// when the dialog opens it will open the inner contexts for the MaximoPlus controls inside the dialog. Once it
// closes we need to clean up that. We will simply see the difference at the time of closing and remove these contexts.
// We need this to be an array, because we may open the dialog from another dialog , like the stack, we need to record the contexts  at the time of opening the dialog
const externalRootContext = {};
export const setExternalRootContext = (rootContext) => {
  externalRootContext.ctx = rootContext;
};

const getRootContext = () => externalRootContext.ctx;

const resolveContainer = (contid, container) => {
  if (kont[contid]) {
    if (kont[contid].resolved) return;
    kont[contid].resolve(container);
    kont[contid].resolved = true;
  } else {
    kont[contid] = Promise.resolve(container);
    kont[contid].resolved = true;
  }
};

const getDeferredContainer = (contId) => {
  if (kont[contId]) {
    return kont[contId];
  }
  let _resolve = null;
  let _reject = null;
  const prom = new Promise(function (resolve, reject) {
    _resolve = resolve;
    _reject = reject;
  });
  prom.resolve = _resolve;
  prom.reject = _reject;
  kont[contId] = prom;
  return prom;
};

export const animating = flyd.stream(false);

const innerContexts = {};
// to simplify the things, we will calculate the id based on the props of the components, and then create the inner context. This will separate completely Maximoplus components from react components

const removeDuplicates = (data) => {
  // removes the adjastent data with the same key
  return data.filter((d, i) => {
    if (i === 0) return true;
    return d.key != data[i - 1].key;
  });
};

/** Internal.
 * Wrapper class for the maximoplus core library. Instead of directly calling updates from MaximoPlus
 * the wrapper calls the updates. This is the helper class for the provider, it proxies the state to the provider, and isolates the states of components
 * @private
 */
class MaximoPlusWrapper {
  /** Constructor, add the actual
   * @private
   * @constructor
   * @param {object} rootContext - the root context of the application
   * @param {string} contextId - the id of the component context
   * @param {object} mp - the actual core library component
   */
  constructor(rootContext, contextId, mp) {
    this.contextId = contextId;
    this.mp = mp;
    this.rootContext = rootContext;
    mp.addWrappedComponent(this);
    this.setState("mp", mp);
  }
  /** Method to be called from the core lib
   * @param {string} property
   * @return {object}
   */
  getInternalState(property) {
    return this.state && this.state[property];
  }
  /** Sets the internal state
   * @param {function} stateF
   */
  setInternalState(stateF) {
    const innerStateF = (state) => {
      // can't ise directly stateF, in case of the dialogs, we need to move the dialog to the upper leel
      const newState = stateF(state);
      const mfs = newState && newState["maxfields"];
      if (mfs) {
        for (let j = 0; j < mfs.length; j++) {
          const newDialogs = mfs[j].dialogs;
          if (!newDialogs) {
            continue;
          }
          let prevDialogs =
            !state.maxfields ||
            state.maxfields.length == 0 ||
            !state.maxfields[j]
              ? []
              : state.maxfields[j].dialogs;
          if (!prevDialogs) {
            prevDialogs = [];
          }
          if (newDialogs.length < prevDialogs.length) {
            setTimeout(() => closeDialog(this.rootContext), 0); // delays are to fix the react warning. Check for a better way to do it leter
          }
          if (newDialogs.length > prevDialogs.length) {
            setTimeout(() => openDialog(newDialogs[0], this.rootContext), 0);
          }
        }
      }
      // this sets the Context, not the state, we need to return the full state, not just the chenge
      return Object.assign({}, state, newState);
    };
    if (this.rootContext.getInnerState(this.contextId)) {
      this.rootContext.setInnerState(this.contextId, innerStateF);
    }
  }
  /** Method to close the dialog */
  closeDialog() {
    // this will be called only from the workflow dialog
    // we will ignore it and depend on the finished value
    closeDialog(this.rootContext);
  }
  /** State getter */
  get state() {
    return this.rootContext.getInnerState(this.contextId);
  }
  /** State setter
   * @param {string} property
   * @param {object} state
   */
  setState(property, state) {
    this.rootContext.setInnerState(this.contextId, (_state) => {
      const ret = _state ? { ..._state } : {};
      ret[property] = state;
      return ret;
    });
  }
}

/*
I will use react context to pass the data from Maximo to the components. The problem is that is difficult to control when the state is set from Maximo to the react component (if the component is mounted, not mounted, how many times the constructor is called, etc.) Instead of this, the context will be unique, based on the Maximo container of the component, and additional properties. In this way, even if the component is destroyed by React, it will still point to the same context. The key of this map is the internal Id, and the value is the context. Another thing we need is the Context Provider component, that we will call to update the state from MaximoPlus that will provide the value for the context
We will have only one context and context provider for the whole application, the consumers will get the data from the context based on their id.
*/

// Dialogs will use special inner context named "dialogs". Dialog holder component willl setup this context. The method from opeing and closing the dialog will be in the dialogcontext, and it will call this functions

/**
 * Standard Maximo callback functi0n. Always called without the parameters.
 * @callback noErrorCallback
 */

/**
 * Standard Maximo error callback function. It always has one error parameter - an error object.
 * @callback errorCallback
 * @param {object} error
 */

/**
 * A dialog is an object with the information to be displayed. Dialog data can be passed from the library, or explicitly when we need to open the dialog.
 * In addition to the properties below, any dialog implementation can have any number of arbitrary properties to be used internally in dialog implementation.
 *
 * @typedef {Object} GeneralDialog
 * @property {string} type - The type of the dialog
 */

/**
 * ListDialog is a particular type of dialog opened directly from the MaximoPlus core library.
 *
 * @typedef {Object} ListDialog
 * @property {string} type - The type of the dialog, list or qbelist
 * @property {object} listContainer - Container with the list of values
 * @property {function} defaultAction - Action to be executed wehn the item ls picked from the list
 * @property {string[]) listColumns - The list of columns to be displayed in dialog
 * @preoprty {object} metadata - The underlying field metadata, used to get the list name and other custom metadata
 */

/**
 * Opens a dialog
 * @function
 * @param {(GeneralDialog|ListDialog)} dialog - dialog to open
 * @param {object} [_rootContext] - internal
 */
export const openDialog = (dialog, _rootContext) => {
  const rootContext = _rootContext ? _rootContext : getRootContext();
  if (!rootContext || !rootContext.getInnerContext("dialogs")) {
    return;
  }

  dialogRefInnerIds.push(Object.keys(innerContexts));
  rootContext.setInnerState("dialogs", (dialogs) => {
    if (!dialogs) {
      return [dialog];
    }
    return [...dialogs, dialog];
  });
};

/**
 * Closes a dialog The dialogs are always put on the stack, so it closes the last opened.
 * @function
 */

export const closeDialog = (_rootContext) => {
  const rootContext = _rootContext ? _rootContext : getRootContext();
  if (!rootContext || !rootContext.getInnerContext("dialogs")) {
    return;
  }
  if (dialogRefInnerIds.length == 0) {
    return;
  }
  const dff = difference(Object.keys(innerContexts), dialogRefInnerIds.pop());

  rootContext.setInnerState("dialogs", (dialogs) => {
    if (dialogs.length == 0) return [];
    const newDialogs = [...dialogs];
    newDialogs.pop();
    for (const j of dff) {
      if (innerContexts[j].mp && innerContexts[j].mp.dispose) {
        innerContexts[j].mp.dispose();
      }
      delete innerContexts[j];
    }
    setTimeout(() => rootContext.removeMultipleInnerContexts(dff), 0);
    return newDialogs;
  });
};

/**
 * AppContainerProps - properties required for the AppContainer
 *
 * @typedef {Object} AppContainerProps
 * @property {string} id - The id of the container
 * @property {string} mboname - The Maximo Mbo name of the container
 * @property {string} appname - The Maximo application name for the container
 */

/** The App Container, main application container for the app*/
export class AppContainer extends React.Component {
  /** Constructor, init the container from the core lib
   * @param {AppContainerProps} props
   */
  constructor(props) {
    super(props);
    if (kont[this.props.id] && kont[this.props.id].resolved) return;
    const mp = new maximoplus.basecontrols.AppContainer(
      this.props.mboname,
      this.props.appname
    );
    if (this.props.offlineenabled) {
      mp.setOfflineEnabled(true);
    }
    resolveContainer(this.props.id, mp);
    this.state = { mp };
    this.save = this.save.bind(this);
    this.rollback = this.rollback.bind(this);
    this.mboCommand = this.mboCommand.bind(this);
    this.mboSetCommand = this.mboSetCommand.bind(this);
  }
  /** getter for the MaximoPlus core object */
  get mp() {
    return this.state.mp;
  }
  /**
   * Main render function
   * @return {React.ReactElement}
   */
  render() {
    return null;
  }
  /** Disposes of the mp container */
  dispose() {
    // we will explicitely delete the cotnainer, and that will happen only for dynamic pages (dialogs)
    this.mp.dispose();
    delete kont[this.props.id];
  }
  /** Save all the pending changes in the container. */
  save() {
    this.state.mp.save();
  }
  /** Rollback all the pending changes in container */
  rollback() {
    this.mp.rollback();
  }
  /** Execute the mbo command on the container
   * @param {string} command
   * @return {Promise}
   */
  mboCommand(command) {
    return this.mp.mboCommand(command);
  }
  /** Execute the mbo set command on the container
   * @param {string} command
   * @return {Promise}
   */
  mboSetCommand(command) {
    return this.mp.mboSetCommand(command);
  }
  /**
   * React prop types
   * @return {AppContainerProps}
   */
  static get propTypes() {
    return {
      id: PropTypes.string,
      mboname: PropTypes.string,
      appname: PropTypes.string,
      offlineenabled: PropTypes.bool,
    };
  }
}

const getStandaloneContainer = (containerConstF) => {
  /** Internal. helper class for standanone contaniers
   * @private
   */
  class StandaloneContainer extends React.PureComponent {
    /** Constructor, intializs the template
     * @param {object} props
     */
    constructor(props) {
      super(props);
      if (kont[this.props.id] && kont[this.props.id].resolved) return;
      getDeferredContainer(this.props.id);
      this.mboCommand = this.mboCommand.bind(this);
      this.mboSetCommand = this.mboSetCommand.bind(this);
    }
    /** getter function for mp object
     * @return {object}
     */
    get mp() {
      return this.state.mp;
    }
    /** React lifecycle method use to resolve the containers */
    componentWillUnmount() {
      this._isMounted = false;
    }

    /** React lifecycle method use to resolve the containers */
    componentDidMount() {
      this._isMounted = true;
      if (kont[this.props.id] && kont[this.props.id].resolved) return;
      const mp = containerConstF(this.props);
      resolveContainer(this.props.id, mp);
      this.setState({ mp });
    }

    /** Dumb render
     * @return {Void}
     */
    render() {
      return null;
    }
    /** Dispose related mp */
    dispose() {
      if (this.mp) {
        this.mp.dispose();
      }
      delete kont[this.props.id];
    }
    /** Execute the mbocommand on the container
     * @param {string} command
     * @return {Promise}
     */
    mboCommand(command) {
      return this.mp.mboCommand(command);
    }
    /** Execute the mbo set command on the container
     * @param {string} command
     * @return {Promise}
     */
    mboSetCommand(command) {
      return this.mp.mbosetCommand(command);
    }
  }
  StandaloneContainer.propTypes = {
    id: PropTypes.string,
  };
  return StandaloneContainer;
};

const getDepContainer = (containerConstF) => {
  /** Internal. helper class for dep contaniers
   * @private
   */
  class DepContainer extends React.PureComponent {
    /** Constructor, intializs the template
     * @param {object} props
     */
    constructor(props) {
      super(props);
      if (kont[this.props.id] && kont[this.props.id].resolved) return;
      getDeferredContainer(this.props.id);
      this.mboCommand = this.mboCommand.bind(this);
      this.mboSetCommand = this.mboSetCommand.bind(this);
    }
    /** getter function for mp object
     * @return {object}
     */
    get mp() {
      return this.state.mp;
    }
    /** React lifecycle method use dto resolve the containers */
    componentWillUnmount() {
      this._isMounted = false;
    }

    /** React lifecycle method use dto resolve the containers */
    componentDidMount() {
      this._isMounted = true;
      if (kont[this.props.id] && kont[this.props.id].resolved) {
        kont[this.props.id].then((mp) => {
          if (this._isMounted) {
            this.setState({ mp });
          }
        });
        return;
      }

      kont[this.props.container].then((mboCont) => {
        if (!this._isMounted) {
          return;
        }
        const mp = containerConstF(mboCont, this.props);
        this.setState({ mp });
        resolveContainer(this.props.id, mp);
      });
    }

    /** Dumb render
     * @return {Void}
     */
    render() {
      return null;
    }
    /** Dispose related mp */
    dispose() {
      if (this.mp) {
        this.mp.dispose();
      }
      delete kont[this.props.id];
    }
    /** Execute the mbocommand on the container
     * @param {string} command
     * @return {Promise}
     */
    mboCommand(command) {
      return this.mp.mboCommand(command);
    }
    /** Execute the mbo set command on the container
     * @param {string} command
     * @return {Promise}
     */
    mboSetCommand(command) {
      return this.mp.mbosetCommand(command);
    }
  }
  DepContainer.propTypes = {
    id: PropTypes.string,
    container: PropTypes.string,
  };
  return DepContainer;
};

/**
 * RelContainerProps - properties required for RelContainer
 * @typedef {Object} RelContainerProps
 * @property {string} id - The id of the container
 * @property {string} container - The id of the parent container
 * @property {string} relationship - The relationship name, as defined in Maximo database configuration
 */

/**
 * RelContainer - The container bound by the MboSet as defined in the Maximo Database Configuration
 * @typeof {React.Component}
 * @param {RelContainerProps} props
 */
export const RelContainer = getDepContainer((mboCont, props) => {
  return new maximoplus.basecontrols.RelContainer(mboCont, props.relationship);
});

/**
 * SingleMboContainerProps - properties required for a SingleMboContainer
 * @typedef {Object} SingleMboContainerProps
 * @property {string} id - The id of the container
 * @property {string} container - The id of the parent container
 */

/**
 * This container creates a separate MboSet with one Mbo only. This Mbo has the same id as a current Mbo in parent MboSet.
 * @typeof {React.Component}
 * @param {SingleMboContainerProps} props
 */
export const SingleMboContainer = getDepContainer(
  (mboCont, props) => new maximoplus.basecontrols.SingleMboContainer(mboCont)
);

export const MboCommandContainer = getDepContainer(
  (mboCont, props) =>
    new maximoplus.basecontrols.MboCommandContainer(
      mboCont,
      props.type,
      props.command,
      props.argControl
    )
);

/**
 * InboxContainer - Workflow Inbox for a logged in user
 * @typeof {React.Component}
 *
 */
export const InboxContainer = getStandaloneContainer(
  (_) => new maximoplus.basecontrols.InboxMboContainer()
);

/** Internal. Basic React component class to be extended by all the visual components
 * @typeof {React.Component}
 * @private
 */
export class MPlusComponent extends React.PureComponent {
  // the following tho methods should be overriden in the concrete implementations with
  // MPlusComponent.prototype.pushDialog = function (dialog)...
  /** Constructor, init the container from the core lib
   * @param {object} props
   */
  constructor(props) {
    super(props);
    this.oid = hash(this.props);
    this.removeContext = this.removeContext.bind(this);
  }
  /** getter for the MaximoPlus core object */
  get mp() {
    return innerContexts[this.oid] && innerContexts[this.oid].mp;
  }
  /** getter for the MaximoPlus wrapper object */
  get wrapper() {
    return innerContexts[this.oid] && innerContexts[this.oid].wrapper;
  }
  /** Dynamic context removal */
  removeContext() {
    // this will be used for dialogs only. Once the dialog is closed, we should remove the context and the MaximoPlus components
    this.context.removeInnerContext(this.oid);
    delete innerContexts[this.oid];
  }
  /** getter for the context */
  get Context() {
    return innerContexts[this.oid] && innerContexts[this.oid].context;
  }
  /** React lifecycle */
  componentDidMount() {
    /*
The components that sub-class this component may have the property container or maxcontainer (but not both).
container is string referencing the container (AppContainer, RelContainer...), maxcontainer is the container itself (usually called from the library code).
In case the container property is passed, we have to make sure container is available (promise is resolved), before we initiate the MaximoPlus library component (section, list...)
    */
    if (!innerContexts[this.oid]) {
      innerContexts[this.oid] = {
        context: this.context.addInnerContext(this.oid),
      };
    }
    if (this.props.container && this.props.maxcontainer) {
      throw Error("can't have both container and maxcontainer as properties");
    }

    if (this.props.container) {
      getDeferredContainer(this.props.container).then((container) => {
        this.putContainer(container);
      });
    }
    if (this.props.maxcontainer) {
      this.putContainer(this.props.maxcontainer);
    }
    animating.map((val) => this.setState({ animating: val })); // if component is animating don't display the change until the animation is finished
  }
  /** React lifecycle method used to init the MaximoPlus core component
   * @param {object} prevProps
   */
  componentDidUpdate(prevProps) {
    /* If for any reason container is changed in the property, we have to re-initialize*/
    if (this.props.container && this.props.container != prevProps.container) {
      getDeferredContainer(this.props.container).then((container) => {
        this.putContainer(container);
      });
    }
    if (
      this.props.maxcontainer &&
      this.props.maxcontainer != prevProps.maxcontainer
    ) {
      this.putContainer(this.props.maxcontainer);
    }
  }

  /** Method to be overriden by the implementations */
  putContainer() {
    throw Error("should override");
  }
}

MPlusComponent.propTypes = {
  container: PropTypes.string,
  maxcontainer: PropTypes.object,
};

/**
 * AdapterProps - React properties of an adapter
 * @typedef {Object} AdapterProps
 * @property {Object} data - In case of the single-row Component Adapter, data attribute gives data for all the columns defined in the adapter
 * @property {function} setMaxValue In case of the single-row Component Adapter, this function is used to change the value of the current Maximo record. The function signature is setMaxValue(attributeName, value)
 * @property{Array} maxrows In case of the multi-rows Component Adapter, maxrows gives the array of data
 * @property {function} fetchMore In case of the multi-rows Component Adapter, if we need to get more data for Maximo, we need to use this function. The signature is fetchMore(numberOfRows)
 * @property {function} setMaxRowValue In case of the multi-rows Component Adapter, sets the value of the Maximo attribute. The signature is setMaxRowValue(rowNum, attributeName, value)
 * @property {function} moveToRow In case if the multi-rows Component Adapter, move the current row of the MboSet. The signature is moveToRow(rowNum)
 */

/**
 * Adapter - React Component used as an interface to MaximoPlus. Use it to define the new component, or adapt the existing React Components into MaximoPlus
 * @typedef {React.Component} Adapter
 * @property {AdapterProps} props
 */

/**
 * React properties of an adapted component for Component Adapter
 * @typedef {Object} AdaptedProps
 * @property {string} contanier The id of the underlying container
 * @property {Array} columns  The Mbo columns included in adapter data
 * @property {number} norows Initial number of rows fetched. If omitted, only one record is fetched
 */

/** Adapted - MaximoPlus React Component ready to be used in a MaximoPlus app, a result of the getComponentAdapter function call.
 * @typedef {React.Component} Adapted
 * @property {AdaptedProps} props
 */

/** HOC for a component adapter
 * @typeof {function}
 * @param {Adapter} Adapter
 * @return {Adapted}
 * @example
 * const TestMultiRowsComponentAdapter = getComponentAdapter(props => {
 *   if (!props || !props.maxrows) return null;
 *   return (
 *     <View>
 *       {props.maxrows.map(({ data }) => (
 *         <View key={data.PONUM}>
 *           {data.PONUM}
 *           ....
 *           {data.STATUS}
 *         </View>
 *       ))}
 *       <Button
 *         onClick={ev => {
 *           console.log("fetch more");
 *           props.fetchMore(5);
 *         }}
 *       >
 *         More
 *       </Button>
 *     </View>
 *   );
 * });
*
*
*  <TestMultiRowsComponentAdapter
*    container="pocont"
*    columns={["ponum", "description", "status"]}
*    norows="20"
 />

 */
export function getComponentAdapter(Adapter) {
  /** Adapter for integrating 3rd party libraries and controls
   * @private
   */
  class MPAdapter extends MPlusComponent {
    /** constructor init the refs and bind
     * @param {object} props
     * @private
     */
    constructor(props) {
      super(props);
      this.setMaxValue = this.setMaxValue.bind(this);
      this.setMaxRowValue = this.setMaxRowValue.bind(this);
      this.fetchMore = this.fetchMore.bind(this);
      this.moveToRow = this.moveToRow.bind(this);
    }
    /** initialize the data for the control */
    initData() {
      this.mp.initData();
    }

    /** Initialize the underlying MaximoPlus component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      const mp = new maximoplus.re.ComponentAdapter(
        mboCont,
        this.props.columns,
        this.props.norows ? this.props.norows : 1
      );
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;

      mp.initData();
    }
    /** Render method of the component
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            if (!value) return null;
            const rownum = value.currow;
            const maxrows = value.maxrows;
            const rowValue = maxrows ? maxrows[rownum] : {}; // for the sake of simplicity, by default return only one object
            if (this.props.norows && this.props.norows > 1) {
              return (
                <Adapter
                  maxrows={maxrows}
                  setMaxRowValue={this.setMaxRowValue}
                  fetchMore={this.fetchMore}
                  moveToRow={this.moveToRow}
                  {...this.props}
                />
              );
            }
            return (
              <Adapter
                {...this.props}
                {...rowValue}
                setMaxValue={this.setMaxValue}
              />
            );
          }}
        </Consumer>
      );
    }
    /** Method to be called from the library or component to change the Maximo value
     * @param {string} column
     * @param {string} value
     */
    setMaxValue(column, value) {
      this.mp.setMaxValue(column, value);
    }
    /** Method to be called from the library or component to change the Maximo value on a row
     * @param {number} rownum
     * @param {string} column
     * @param {string} value
     */
    setMaxRowValue(rownum, column, value) {
      this.mp.setMaxRowValue(rownum, column, value);
    }
    /** Intially cmponent adapter gets just the number of rows defined in the constructor. Call this to get more rows from Maximo
     * @param {number} rows
     */
    fetchMore(rows) {
      this.mp.fetchMore(rows);
    }
    /** Moves undelyug container to row
     * @param {number} rownum
     */
    moveToRow(rownum) {
      this.mp.moveToRow(rownum);
    }
    /** Internal getter*/
    static get contextType() {
      return getRootContext();
    }
  }
  MPAdapter.propTypes = {
    columns: PropTypes.array,
  };
  return MPAdapter;
}

/** HOC to get the Picker
 * @param {object} Picker
 * @return {MPlusComponent}
 * @private
 */
export function getAppDocTypesPicker(Picker) {
  // picker shouuld be the component, that has the state value. We will get the value by ref forwarding

  const AppDocPicker = getComponentAdapter(Picker);
  /** AppDocTypes picker
   * @private
   */
  class MPAppDoctypes extends React.Component {
    /** Constructor, init the ref
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.currentRef = React.createRef();
      this.state = { appDocCont: null };
    }
    /** React render picker
     * @return {React.Element}
     */
    render() {
      if (!this.state.appDocCont) return null;
      return (
        <>
          <AppDocPicker
            maxcontainer={this.state.appDocCont}
            columns={["doctype"]}
            norows={100}
            ref={this.currentRef}
          />
        </>
      );
    }
    /** React lifecycle method, used to init the containers */
    componentDidMount() {
      if (this.state.appDocType) return;
      kont[this.props.container].then((mboCont) => {
        const app = "=" + mboCont.getApp();
        const appDocCont = new maximoplus.basecontrols.MboContainer(
          "appdoctype"
        );
        appDocCont.setQbe("app", app);
        this.setState({ appDocCont: appDocCont });
      });
    }
    /** value getter*/
    get value() {
      return this.currentRef.current.state.value;
    }
  }
  MPAppDoctypes.propTypes = {
    container: PropTypes.string,
  };
  return MPAppDoctypes;
}

/** HOC to return the Simple List.
 * For example, take a look at the implementation of List in React Native template.
 * @param {function} WrappedList - component that does the rendering
 * @return {MPlusComponent}
 **/
export function getSimpleList(WrappedList) {
  /** Simple List component */
  class MPSimpleList extends MPlusComponent {
    /** Constructor, init the container from the core lib
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.fetchMore = this.fetchMore.bind(this);
      this.pagePrev = this.pagePrev.bind(this);
      this.rowAction = this.rowAction.bind(this);
      this.showFilter = this.showFilter.bind(this);
      if (this.props.dataSetCallback && !this.state) {
        this.props.dataSetCallback({
          fetchMore: this.fetchMore,
          pageNext: this.pageNext,
          pagePrev: this.pagePrev,
        });
      }

      this.state = { dataSetInitialized: true };
    }
    /** init the component data*/
    initData() {
      this.mp.initData();
    }

    /** Initializes underlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }

      const mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );

      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      if (!this.props.globalWaiting) {
        this.enableLocalWaitSpinner.bind(this)();
      }
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }
      if (this.props.initdata) {
        mp.initData();
      }
    }
    /** When MaximoPlus calls this function, the wait indicator will be displayed locally.*/
    enableLocalWaitSpinner() {
      // useful for infinite scroll if we want to display the  spinner below the list. If not enabled, global wait will be used

      this.mp.prepareCall = (_) => {
        if (!this.wrapper) return;
        this.wrapper.setState("waiting", true);
        this.wrapper.setState("startWait", Date.now());
      };
      this.mp.finishCall = (_) => {
        if (this.wrapper) {
          this.wrapper.setState("waiting", false);
        }
      };
    }
    /**
     * Fetch more records into the list, used mostly for infinite scrolling.
     * @param {number} numRows
     */
    fetchMore(numRows) {
      this.mp.fetchMore(numRows);
    }
    /**
     * Used for pagination instead of infinite list
     * Goes to the next page
     */
    pageNext() {
      this.mp.pageNext();
    }
    /**
     * Used for pagination instead of infinite list
     * Goes to the previous page
     */
    pagePrev() {
      this.mp.pagePrev();
    }

    /**
     * Row action is the function to be called when the user selects the row on the list.
     * By default, it navigates to the selected row. If there is the user action defined, it executes it as well.
     * @param {number} mxrow
     */
    rowAction(mxrow) {
      this.mp.rowAction(mxrow);
    }

    /** React render
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            if (!value) {
              return null;
            }
            const waiting = value.waiting;
            //            const paginator = value.paginator;
            const maxrows = value.maxrows;
            //            const _waiting =
            //              waiting && (!paginator || paginator.numrows != paginator.torow);

            let drs = [];
            drs =
              maxrows &&
              maxrows
                .filter((o) => o.data)
                .map((o) => {
                  o.key = o.data["_uniqueid"] || o.data["uniqueid"]; // for the offline
                  o.rowAction = this.rowAction;
                  return o;
                })
                .filter(({ key }) => key != undefined);
            drs = drs ? removeDuplicates(drs) : [];
            return (
              <WrappedList
                {...this.props}
                data={drs}
                waiting={waiting}
                pageNext={this.pageNext}
                pagePrev={this.pagePrev}
                fetchMore={this.fetchMore}
                showFilter={this.showFilter}
                rowAction={this.rowAction}
              />
            );
          }}
        </Consumer>
      );
    }
    /** Display the filter */
    showFilter() {
      const container = this.props.maxcontainer
        ? this.props.maxcontainer
        : kont[this.props.container];
      openDialog(
        {
          type: "filter",
          maxcontainer: container,
          filtername: this.props.filterTemplate,
        },
        this.context
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }

  MPSimpleList.propTypes = {
    container: PropTypes.string,
    listTemplate: PropTypes.string,
    filterTemplate: PropTypes.string,
  };
  return MPSimpleList;
}

/** HOC to get the picker list
 * @param {function} drawPickerOption - draws individual option
 * @param {function} drawPicker - draws whole picker
 * @return {MPlusComponent}
 */
export function getPickerList(drawPickerOption, drawPicker) {
  /** Picker component */
  class MPPickerList extends MPlusComponent {
    /** Init underlying maximoplus grid
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      const mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }

      mp.initData();
      this.props.maxpickerfield.addPickerList(mp);
    }
    /** React render method
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            if (!value) return null;
            const maxrows =
              value.maxrows && value.maxrows.filter(({ data }) => data);
            let drs = [];
            if (maxrows) {
              drs = maxrows.map((object, i) => {
                const selected =
                  object.picked ||
                  (typeof object.picked === "undefined" && object.selected);
                const optionKey =
                  object.data[this.props.pickerkeycol.toUpperCase()];
                const optionVal =
                  object.data[this.props.pickercol.toUpperCase()];
                return drawPickerOption(
                  this.props.label,
                  selected,
                  optionKey,
                  optionVal,
                  this.props.changeListener
                );
              });
            }
            return drawPicker(
              this.props.label,
              this.props.changeListener,
              drs,
              this.props
            );
          }}
        </Consumer>
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPPickerList.propTypes = {
    label: PropTypes.string,
    changeListener: PropTypes.func,
    pickercol: PropTypes.string,
    pickerkeycol: PropTypes.string,
  };
  return MPPickerList;
}

/** HOC to return the Section component
 * @param {object} WrappedTextField - text field
 * @param {object} WrappedPicker - picker comp
 * @param {boolean} drawFields - if true return the array, rendering in implemetation
 * @return {MPlusComponent}
 */
export function getSection(WrappedTextField, WrappedPicker, drawFields) {
  // like for the list, here we also support the "raw" rendering, i.e. this HOC returns the data, and parent does the actual rendering. We don't need the raw field for this, if wrappers are null, we just return the props. For picker list,we will have to send the array of values in one field (so we need to transfer the field row state to props)

  /** Section Component*/
  class MPSection extends MPlusComponent {
    /** Constructor, binds the change function
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.changeInternalFieldValue = this.changeInternalFieldValue.bind(this);
      this.preloadOfflineList = this.preloadOfflineList.bind(this);
      this.preloadedOfflineLists = {};
      this.state = { fieldValues: {} };
    }
    /**
     * Init underlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      const mp = new maximoplus.re.Section(mboCont, this.props.columns);
      const metadata = this.props.metadata;
      if (metadata) {
        mp.addColumnsMeta(metadata);
      }
      mp.renderDeferred();
      mp.initData();

      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;

      /*
If we call the maximo change handler for every field, Maximo may change the values, while the user is typing (it is trimming the spaces for example). We will keep the values internally in the state, and pass 2 functions to the field: 1) function that changes this state that is called from onChange field handler, and 2) Maximo change function that is called from onblur
      */
      // i think this is the best place to initiate the offloading of the lists, because it will be done only once, and the conainer is avaliable
    }
    /** Value to be kept internally before sending it to Maximo. React changes on every letter, Maximo is designed to react on blur.
     * @param {string} fieldKey
     * @param {string} value
     */
    changeInternalFieldValue(fieldKey, value) {
      const newFieldValues = Object.assign({}, this.state.fieldValues);
      newFieldValues[fieldKey] = value;
      this.setState({ fieldValues: newFieldValues });
    }
    /** React lifecycle, used to add the meta.
     * @param {object} prevProps
     */
    componentDidUpdate(prevProps) {
      super.componentDidUpdate(prevProps);
      if (prevProps.metadata != this.props.metadata && this.mp) {
        this.mp.addColumnsMeta(this.props.metadata);
      }
    }
    /**
     *  render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            let flds = [];
            const raw = !WrappedTextField;
            if (value && value.maxfields) {
              flds = value.maxfields.map((f, i) => {
                const fKey = f.metadata.attributeName + i;
                if (f.metadata.preloadOffline) {
                  this.preloadOfflineList(f.metadata);
                }
                if (f.metadata.picker && f.picker) {
                  const lst = f.picker.list;
                  if (lst) {
                    if (raw) {
                      return {
                        label: f.metadata.title,
                        maxcontainer: lst.listContainer,
                        selectableF: lst.selectableF,
                        pickercol: lst.pickerCol,
                        pickerkeycol: lst.pickerKeyCol,
                        columns: [lst.pickerKeyCol, lst.pickerCol],
                        changeListener: f.listeners["change"],
                        maxpickerfield: f.maximoField,
                        enabled: !f.readonly,
                        required: f.required,
                        norows: f.metadata.pickerrows,
                        type: f.metadata.maxType,
                        kind: "picker",
                        key: fKey,
                        metadata: f.metadata,
                        pickerValue: f.data,
                      };
                    }
                    return (
                      <WrappedPicker
                        label={f.metadata.title}
                        maxcontainer={lst.listContainer}
                        selectableF={lst.selectableF}
                        pickercol={lst.pickerCol}
                        pickerkeycol={lst.pickerKeyCol}
                        columns={[lst.pickerKeyCol, lst.pickerCol]}
                        changeListener={f.listeners["change"]}
                        maxpickerfield={f.maximoField}
                        enabled={!f.readonly}
                        required={f.required}
                        norows={f.metadata.pickerrows}
                        type={f.metadata.maxType}
                        key={fKey}
                        metadata={f.metadata}
                        pickerValue={f.data}
                      />
                    );
                  } else {
                    return raw ? { key: fKey } : <React.Fragment key={fKey} />;
                  }
                } else {
                  const _val =
                    this.state.fieldValues[fKey] != undefined
                      ? this.state.fieldValues[fKey]
                      : f.data;
                  const attrs = {
                    label: f.metadata.title,
                    value: _val,
                    type: f.metadata.maxType,
                    listener: (value) =>
                      this.changeInternalFieldValue(fKey, value),
                    changeListener: () => {
                      const newFst = Object.assign({}, this.state.fieldValues);
                      const __vval = newFst[fKey];
                      if (__vval != undefined) {
                        // post the change only if there was change
                        delete newFst[fKey];
                        this.setState({ fieldValues: newFst });
                        f.listeners["change"](_val);
                      }
                    },
                    immediateChangeListener: f.listeners["change"],
                    enabled: !f.readonly,
                    required: f.required,
                    fieldKey: fKey,
                    metadata: f.metadata,
                    key: fKey,
                  };
                  if (f.metadata.hasLookup) {
                    if (f.metadata.gl) {
                      attrs.showLookupF = () => f.maximoField.showGlLookup();
                    } else {
                      attrs.showLookupF = () => f.maximoField.showLookup();
                    }
                  }
                  if (raw) {
                    attrs.kind = "field";
                    return attrs;
                  }
                  return <WrappedTextField {...attrs} />;
                }
              });
            }
            return drawFields(flds, this.props);
          }}
        </Consumer>
      );
    }
    /**
     * preloadOfflineList if indicated by metadata
     * @param {object} fieldMeta
     */
    preloadOfflineList(fieldMeta) {
      const attributeName = fieldMeta.attributeName;
      if (this.mp && !this.preloadedOfflineLists[attributeName]) {
        this.preloadedOfflineLists[attributeName] =
          maximoplus.basecontrols.listToOffline(
            this.mp.getContainer(),
            attributeName,
            fieldMeta.listColumns,
            fieldMeta.offlineReturnColumn
          );
      }
    }
    /** Internal*/
    static get contextType() {
      return getRootContext();
    }
  }
  MPSection.propTypes = {
    container: PropTypes.string,
    columns: PropTypes.array,
  };
  return MPSection;
}

/** HOC to return the QbeSection component
 * @param {object} WrappedTextField - text field
 * @param {boolean} drawFields - if true return the array, rendering in implemetation
 *  @param {boolean} drawSearchButtons - if true return the array, rendering in implemetation
 * @return {MPlusComponent}
 */
export function getQbeSection(WrappedTextField, drawFields, drawSearchButtons) {
  /** Qbe section component */
  class MPQbeSection extends MPlusComponent {
    /** Constructor, binds the change function
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.getControlActions = this.getControlActions.bind(this);
      this.clear = this.clear.bind(this);
      this.search = this.search.bind(this);
      this.runControlAction = this.runControlAction.bind(this);
      this.changeInternalFieldValue = this.changeInternalFieldValue.bind(this);
      this.preloadOfflineList = this.preloadOfflineList.bind(this);
      this.preloadedOfflineLists = {};
      this.state = { fieldValues: {} };
    }

    /** Value to be kept internally before sending it to Maximo. React changes on every letter, Maximo is designed to react on blur,
     * @param {string} fieldKey
     * @param {string} value
     */
    changeInternalFieldValue(fieldKey, value) {
      const newFieldValues = Object.assign({}, this.state.fieldValues);
      newFieldValues[fieldKey] = value;
      this.setState({ fieldValues: newFieldValues });
    }
    /**
     * Init underlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      const mp = new maximoplus.re.QbeSection(mboCont, this.props.columns);

      /*
	 Important.
	 The QbeSection in MaximoPlus core library is the only component where column may be the string or the javascript object. The case for javascript object is when we want to search the range in QbeSection. For that we use the standard Maximo functionality - qbePrepend. The columns have to be registered when creating the QbeSection, and the qbePrepend data has to be sent with them, this is why we have that exception. For the case of the components registered with the markup (HTML or JSX, for the web components or React), we already have the metadata defined at the same time as the columns, so we can read this from the metadata itself, and send to the  MaximoPlus constructor.
	 */

      if (this.props.qbePrepends) {
        for (const qp of this.props.qbePrepends) {
          mp.addPrependColumns(
            qp.virtualName,
            qp.qbePrepend,
            qp.attributeName,
            qp.title,
            parseInt(qp.position)
          );
        }
      }

      if (this.props.metadata) {
        mp.addColumnsMeta(this.props.metadata);
      }

      mp.renderDeferred();
      mp.initData();

      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
    }
    /** Clears the qbe */
    clear() {
      this.mp.clearQbe();
    }
    /** Internal */
    componentWillUnmount() {
      //      if (this.mp) this.mp.clearQbe();
    }
    /** Perform the search for the entered qbe */
    search() {
      this.mp.getContainer().reset();
      if (this.props.indialog) {
        // should not do this for the static qbe section
        this.mp.getParent().removeChild(this.mp); // MaximoPlus will try to send data on reset finish to this component
        closeDialog(this.context); // dialogs will be modal. If i can access the search, and there are dialogs, that means I clicked search from the dialog. If there are no dialogs, this command doesn't do anything
      }
    }
    /** Get the search buttons for the qbe control.
     * @return {array}
     */
    getSearchButtons() {
      // this may not be necessary, it will render the search buttons for the dialog
      const buttons = [
        { label: "Search", action: this.search, key: "search" },
        { label: "Clear", action: this.clear, key: "clear" },
      ];
      if (this.filterDialog) {
        buttons.push({
          label: "Cancel",
          action: (ev) => this.filterDialog.closeDialog(),
        });
      }
      return drawSearchButtons(buttons, this.props);
    }
    /** returns control actions
     * @return {array}
     */
    getControlActions() {
      // this is the "interface" method - we can use it for all the types of controls
      return this.getSearchButtons();
    }
    /** Runs the control action (clear or search)
     * @param {string} actionKey
     */
    runControlAction(actionKey) {
      // In React, if the actions are returned directly like in getSearchButtons, the binding loses the state
      // Instead this function called from the ref should work properly
      if (actionKey == "clear") {
        this.clear();
      }
      if (actionKey == "search") {
        this.search();
      }
    }
    /**
     *  render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            let flds = [];
            const buttons = this.getSearchButtons();
            if (value && value.maxfields) {
              flds = value.maxfields.map((f, counter) => {
                if (f.metadata.preloadOffline) {
                  this.preloadOfflineList(f.metadata);
                }
                const fKey = f.metadata.attributeName + counter;
                const _val =
                  this.state.fieldValues[fKey] != undefined
                    ? this.state.fieldValues[fKey]
                    : f.data;
                const attrs = {
                  metadata: f.metadata,
                  label: f.metadata.title,
                  value: _val,
                  type: f.metadata.maxType,
                  enabled: true,
                  changeListener: () => {
                    const newFst = Object.assign({}, this.state.fieldValues);
                    const __vval = newFst[fKey];
                    if (__vval != undefined) {
                      // post the change only if there was change
                      delete newFst[fKey];
                      this.setState({ fieldValues: newFst });
                      f.listeners["change"](_val);
                    }
                  },
                  listener: (value) =>
                    this.changeInternalFieldValue(fKey, value),
                  immediateChangeListener: f.listeners["change"],
                  fieldKey: f.metadata.attributeName + counter,
                };
                if (f.metadata.hasLookup) {
                  attrs.showLookupF = () => f.maximoField.showLookup();
                  attrs.qbe = true; // in qbe mode display only the text field, not the checkbox
                }
                if (!WrappedTextField) {
                  return attrs;
                }
                return <WrappedTextField key={attrs.fieldKey} {...attrs} />; // try to put this as a function, to be able to override. There is no indirection, or maybe HOC
              });
            }
            return drawFields(flds, buttons, this.props);
          }}
        </Consumer>
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
    /**
     * preloadOfflineList if indicated by metadata
     * @param {object} fieldMeta
     */
    preloadOfflineList(fieldMeta) {
      const attributeName = fieldMeta.attributeName;
      if (this.mp && !this.preloadedOfflineLists[attributeName]) {
        this.preloadedOfflineLists[attributeName] =
          maximoplus.basecontrols.listToOffline(
            this.mp.getContainer(),
            attributeName,
            fieldMeta.listColumns,
            fieldMeta.offlineReturnColumn
          );
      }
    }
  }
  MPQbeSection.propypes = {
    container: PropTypes.string,
    columns: PropTypes.array,
  };
  return MPQbeSection;
}

/** HOC to get the dialog
 * @param {object} DialogWrapper
 * @param {function} getDialogF
 * @param {function} defaultCloseDialogAction
 * @return {MPlusComponent}
 */
function getDialog(DialogWrapper, getDialogF, defaultCloseDialogAction) {
  /** Dialog Component */
  class Dialog extends React.Component {
    /** React lifecycle method
     * @param {object} props
     * @param {object} state
     * @return {boolean}
     */
    shouldComponentUpdate(props, state) {
      if (!props.dialogs || props.dialogs.length == this.props.dialogs.length)
        return false;
      return true;
    }
    /**
     *  render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.props.dialogs || this.props.dialogs.length == 0) {
        return null;
      }
      const currDialog = this.props.dialogs[this.props.dialogs.length - 1];
      if (!currDialog) {
        return null;
      } else {
        const CurrDialog = getDialogF(currDialog);
        if (CurrDialog) {
          return (
            <DialogWrapper
              defaultAction={currDialog.defaultAction}
              closeAction={
                currDialog.closeAction
                  ? currDialog.closeAction
                  : defaultCloseDialogAction
              }
            >
              <CurrDialog {...currDialog} />
            </DialogWrapper>
          );
        }
        return null;
      }
    }
  }
  Dialog.propTypes = {
    dialogs: PropTypes.array,
  };
  return Dialog;
}

// Every MaximoPlus component will create the context. The dialog wrapper should remove the context once the dialog is closed.
// If the getDialogF returns directly the MaximoPlus components, it will have the oid property. DialogWrapper should remove thiat context
// If there is no oid, the dialog should have the cleanContext, that should clean context on each MaximoPlus component

/** HOC to get the dialog holder
 * @private
 * @param {object} DialogWrapper
 * @param {function} getDialogF
 * @param {boolean} raw
 * @return {MPlusComponent}
 */
export function getDialogHolder(DialogWrapper, getDialogF, raw) {
  /** Dialog holder
   * @private
   */
  class MPDialogHolder extends React.Component {
    /** Constructor, binds the open and close dialog functions
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.openDialog = this.openDialog.bind(this);
      this.closeDialog = this.closeDialog.bind(this);
    }
    /** internal */
    get Context() {
      return innerContexts["dialogs"];
    }
    /** Opens the dialog
     * @param {object} dialog
     */
    openDialog(dialog) {
      // can't access the openDialog and closeDialog functions directlry, becaise of the contexts
      // the dialogholder will have to be reffed from the main template, and there we can call this functions
      openDialog(dialog, this.context);
    }
    /** Closes the currently open dialog */
    closeDialog() {
      closeDialog(this.context);
    }
    /**
     * React render function
     * @return {React.ReactElement}
     */
    render() {
      /*
If both dialogwrapper and getdialogf is null, let the implementation manage the dialogs on itself
*/
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      let Dialog = null;
      if (!raw) {
        Dialog = getDialog(DialogWrapper, getDialogF, (_) =>
          closeDialog(this.context)
        );
        return (
          <Consumer>
            {(dialogs) => {
              if (!dialogs) return null;
              return <Dialog dialogs={dialogs} />;
            }}
          </Consumer>
        );
      } else {
        const ff = (_) => closeDialog(this.context);
        // in this case the implementation will take care of the dialog openings and closing
        return (
          <Consumer>
            {(dialogs) => {
              const dials = dialogs
                ? dialogs.map((d) => {
                    d.closeTheDialog = ff;
                    return d;
                  })
                : null;
              return <DialogWrapper dialogs={dials} />;
            }}
          </Consumer>
        );
      }
    }
    /** React lifecycle component, attach the dialog context */
    componentDidMount() {
      if (!innerContexts["dialogs"]) {
        innerContexts["dialogs"] = this.context.addInnerContext("dialogs");
      }
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPDialogHolder.propTypes = {};
  return MPDialogHolder;
}

/** HOC to return the List Dialog
 * not implemented in RN templage, maybe remove
 * @param {object} WrappedList
 * @param {function} drawList
 * @private
 * @return {MPlusComponent}
 */
export function getListDialog(WrappedList, drawList) {
  /** List Dialog components
   * @private
   */
  class MPListDialog extends React.Component {
    /**
     * React render function
     * @return {React.ReactElement}
     */
    render() {
      const LstD = drawList();

      return (
        <LstD {...this.props}>
          <WrappedList
            norows="10"
            listTemplate={this.props.dialog.field.getMetadata().listTemplate}
            filterTemplate={
              this.props.dialog.field.getMetadata().filterTemplate
            }
            maxcontainer={this.props.dialog.listContainer}
            initdata="true"
            columns={this.props.dialog.dialogCols}
            selectableF={this.props.dialog.defaultAction}
          />
        </LstD>
      );
    }
    /** React lifecycle component */
    componentWillUnmount() {
      if (this.props.dialog.listContainer) {
        //  this.props.dialog.listContainer.reset();
        // clear the filter (check unmount from qbesection
      }
    }
  }
  MPListDialog.propTypes = {
    dialog: PropTypes.object,
  };
  return MPListDialog;
}

/** Function to return the filter dialog
 * Not implemented in RN template, consider for removing
 * @private
 * @param {function} getFilter - function to get the filter
 * @param {function} drawFilter - draw the filter
 * @return {MPlusComponent}
 */
export function getFilterDialog(getFilter, drawFilter) {
  return (props) => drawFilter(getFilter(props.dialog));
}

/** HOC to return the gl dialog
 * @param {function} drawDialog - function to draw the gl dialog
 * @param {MPlusComponent} WrappedList - List component
 * @return {MPlusComponent}
 * @private not yet in RN template
 */
export function getGLDialog(drawDialog, WrappedList) {
  // glindividualsegment is a function of object with the following keys:
  // - listener
  // - segmentName
  // - segmentValue
  // - segmentDelimiter
  // drawSegments is  a function that draws all the segments into one gl (arg - array of above objects)
  // drawDialog draws the final dialog from all these
  // WrappedList - concreate List implementation
  /** GL Dialog component
   * @private
   */
  class MPGLDialog extends MPlusComponent {
    /** React lifecycle component */
    componentDidMount() {
      super.componentDidMount();
      if (this.mp) {
        return;
      }

      const mp = new maximoplus.re.GLDialog(this.props.field, this.props.orgid);
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      mp.renderDeferred();
    }
    /** React render lifecycle method
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            if (!value || !value.segments || !value.pickerlist) return null;
            const segments = value.segments;
            const pickerList = value.pickerlist;
            const chooseF = value.chooseF;
            const gllist = (
              <WrappedList
                maxcontainer={pickerList.glcontainer}
                columns={pickerList.pickercols}
                norows="20"
                initdata="true"
                listTemplate="gllist"
                selectableF={pickerList.pickerf}
              />
            );
            return drawDialog(
              segments,
              gllist,
              chooseF,
              this.props.forwardedRef
            );
          }}
        </Consumer>
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPGLDialog.propTypes = { field: PropTypes.object, orgid: PropTypes.string };
  return MPGLDialog;
}

/**
 * A function to draw a workflow dialog
 * @callback drawDialog
 * @param {Array} buttons The array of objects with labels and functions to be executed, depends on the stage of the workflow
 * @param {Object} section - The Section child component
 * @param {string} title The title of the current workflow step
 * @param {Array} warnings If routing the workflow returns messages or errors from the server, in the next step they will come to the workflow component
 */

/** Workflow component props
 * @typedef {Object} WFProps
 * @property {string} container The id of the Application Container
 * @property {string} processName The name of the main active WF process on the container
 */

/** Workflow component
 * @typedef {React.Component} Workflow
 * @param {WFProps} props
 *
 */

/** HOC to return the workflow component - Check the RN template implementation for an example
 * @param {Object} WrappedSection The Section component to draw the dialogs
 * @param {drawDialog} drawDialog
 * @return {Workflow}
 */
export function getWorkflowDialog(WrappedSection, drawDialog) {
  /** Workflow dialog component
   * @private
   */
  return class MPWorkflowDialog extends MPlusComponent {
    /** Constructor, inits the state
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.state = { finished: false };
    }
    /**
     * Init uderlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      const mp = new maximoplus.re.WorkflowControl(
        mboCont,
        this.props.processname
      );

      mp.routeWf();
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
    }
    /**
     * React render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {(value) => {
            const section = value && value.section;
            const actions = value && value.actions;
            if (!section || !section.fields || !actions) {
              return null;
            }
            let metadata = {
              ACTIONID: {
                picker: "true",
                pickerkeycol: "actionid",
                pickercol: "instruction",
                pickerrows: "10",
              },
            };

            if (section.objectName == "REASSIGNWF") {
              metadata = {
                ASSIGNEE: { hasLookup: "true", listTemplate: "personlist" },
              };
            }
            return drawDialog(
              value.title,
              <WrappedSection
                maxcontainer={section.container}
                columns={section.fields}
                metadata={metadata}
              />,
              actions,
              value.warnings
            );
          }}
        </Consumer>
      );
      //
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  };
}

/**
 * Gets the attribute value of the current row in a container.
 * @function
 * @param {string} contid The id of the container
 * @param {strong} column The attribute name in the Mbo. It must be defined in any component bound to the container; otherwise, the value will be empty.
 * @return {Promise}
 */
export const getLocalValue = (contid, column) => {
  return getDeferredContainer(contid).then((mp) => {
    const ret = mp.getFieldLocalValue(column.toUpperCase());
    //    console.log(column + "=" + ret);
    return ret;
  });
};

/**
 * Discard the changes in a container, and reloads the application data from the server
 * @function
 * @param{string} contid The id of the container
 * @return {Promise}
 */
export const reload = (contid) => {
  return getDeferredContainer(contid).then((mp) => {
    mp.reset();
    return mp.moveToRow(0);
  });
};

/**
 * Saves the changes for the Application Container
 * @function
 * @param {string} contid The id of the application container
 * @return {Promise}
 */
export const save = (contid) => {
  return getDeferredContainer(contid).then((mp) => mp.save());
};

/**
 * Constructs the server URL for download, based on the DOCLINKS container id
 * @function
 * @param {string} doclinkscontid The id of the DOCLINKS container
 * @param {string?} method By default, it is "doclinks". It is possible to creaate the custom download methods, contact the support for detaild
 * @param {Array?} params For the custom dowload method, the optional list of parameters
 * @return {string}
 */
export const getDownloadURL = (doclinkscontid, method, params) =>
  getDeferredContainer(doclinkscontid).then((container) =>
    maximoplus.net.getDownloadURL(
      container,
      method ? method : "doclinks",
      params ? params : {}
    )
  );

/**
 * File object for React Native
 * @typedef {Object} RNFile
 * @property {string} name The name of the file
 * @property {string} url The URL pointing to the file. In React Native we get it when using the File Picker or Photo navigation, check RN template for example
 * @property {string} type The MIME type of the file
 */

/**
 * Uploads a  file to Maximo. By default, it uses the standard Maximo DOCLINKS, although the custom upload is possible.
 * @function
 * @param {string} container The id of the container
 * @param {string} uploadMethod By default, it is "doclinks". The custom upload methods are possible. For details contact our support
 * @param {File|RNFile} file The file to upload. In React Native, the standard File interface from the Web API is not implemented, we need to pass the object with name, url and type properties
 * @param {string} doctype The Maximo document type
 * @return {Promise}
 */
export const uploadFile = (container, uploadMethod, file, doctype) => {
  const fd = new FormData();
  fd.append("docname", file.name);
  fd.append("doctype", doctype);
  //  fd.append("file", file);
  const prom = getDeferredContainer(container).then((mbocont) => {
    return new Promise((resolve, reject) => {
      if (!isCordovaApp) {
        fd.append("file", file);
        maximoplus.net.upload(
          mbocont,
          uploadMethod,
          null,
          fd,
          function (ok) {
            resolve(ok);
          },
          function (err) {
            reject(err);
          },
          function (loaded, total) {
            file.percloaded = Math.round(loaded / total);
          }
        );
      } else {
        const reader = new FileReader();
        reader.onloadend = (evt) => {
          const blob = new Blob([evt.target.result], { type: "image/jpeg" });
          fd.append("file", blob, file.name);
          maximoplus.net.upload(
            mbocont,
            uploadMethod,
            null,
            fd,
            function (ok) {
              resolve(ok);
            },
            function (err) {
              reject(err);
            },
            function (loaded, total) {
              file.percloaded = Math.round(loaded / total);
            }
          );
        };
        reader.readAsArrayBuffer(file);
      }
    });
  });
  return prom;
};

/**
 * Runs a Mbo command on the container
 * @function
 * @param {string} kontId The id of the contaienr
 * @param {string} command The method name on Mbo
 */
export const mboCommand = (kontId, command) => {
  return getDeferredContainer(kontId).then((mp) => {
    return mp.mboCommand(command);
  });
};

/**
 * Runs a Mbo command on the container
 * @function
 * @param {string} kontId The id of the contaienr
 * @param {string} command The method name on MboSet
 */
export const mboSetCommand = (kontId, command) => {
  return getDeferredContainer(kontId).then((mp) => {
    return mp.mbosetCommand(command);
  });
};

export const setValue = (kontId, column, value) => {
  return getDeferredContainer(kontId).then((mp) => {
    return mp.setValue(column, value);
  });
};

export const getRowCount = (kontId) => {
  return getDeferredContainer(kontId).then((mp) => {
    return mp.getRowCount();
  });
};

export const setOrderBy = (kontId, column) => {
  return getDeferredContainer(kontId).then((mp) => {
    return mp.setOrderBy(column);
  });
};

export const getOfflineErrorDisplay = (Adapter) => {
  /**
   * Internal. Offline Error displayer component
   */
  class OfflineErrorDP extends React.Component {
    /** Constructor
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.displayErrors = this.displayErrors.bind(this);
      maximoplus.core.globalFunctions.globalOfflinePostError =
        this.displayErrors;
      this.state = { errors: [] };
    }
    /** Display the errors on the global error handler
     * @param {array} errors
     */
    displayErrors(errors) {
      this.setState({ errors: errors });
    }
    /**
     * Main render function
     * @return {React.ReactElement}
     */
    render() {
      const errdisp = this.state.errors.map((e) => (
        <Adapter key={e.id} {...e} />
      ));
      return <>{errdisp}</>;
    }
  }

  OfflineErrorDP.propTypes = {};
  return OfflineErrorDP;
};

/**
* Preloads all the data to offline. All the records from the primary container ,and all the related containers will be stored offline. Make sure that the number of rows to be fetched is limited; otherwise, the performance hit will happen.

* @function
* @return {void}
*/
export const preloadOffline = () => maximoplus.basecontrols.offload();

/**
 * Unloads the offline data
 * @function
 * @return {void}
 */
export const unloadOffline = () => maximoplus.basecontrols.unload();

/**
 * Sets the QBE on the container
 * @function
 * @param {string} contId - the id of the container
 * @param {string} attributeName - the name of the Mbo attribute
 * @param {string} qbe - the Maximo QBE expression for an attribute
 * @return {Promise}
 */
export const setQbe = (contId, attributeName, qbe) => {
  return getDeferredContainer(contId).then((mp) => {
    return mp.setQbe(attributeName, qbe);
  });
};

/**
 * Adds a row to the container
 * @function
 * @param {string} contId - The id of the container
 * @return {Promise}
 */
export const addRow = (contId) => {
  return getDeferredContainer(contId).then((mp) => {
    return mp.addNewRow();
  });
};

/**
 * Adds a row to the container at an index
 * @function
 * @param {string} contId - The id of the container
 * @param {number} index - The position of the new row in the MboSer
 * @return {Promise}
 */
export const addRowAt = (contId, index) => {
  return getDeferredContainer(contId).then((mp) => {
    return mp.addNewRowAt(index);
  });
};

/**
 * Deletes a current row from the container
 * @function
 * @param {string} contId - The id of the container
 * @return {Promise}
 */
export const delRow = (contId) => {
  return getDeferredContainer(contId).then((mp) => {
    return mp.delRow();
  });
};

/**
 * Undeletes a current row from the container
 * @function
 * @param {string} contId - The id of the container
 * @return {Promise}
 */
export const undelRow = (contId) => {
  return getDeferredContainer(contId).then((mp) => {
    return mp.undelRow();
  });
};

/**
 * Moves the container to the uniqueid
 * @function
 * @param {string} contId - The id of the container
 * @param {integer} uniqueId - The unique id of the Mbo row
 * @return {Promise}
 */
export const moveToUniqueId = (contId, uniqueId) => {
  return getDeferredContainer(contId).then((mp) => {
    mp.moveToUniqueid(uniqueId);
  });
};

/**
 * Sets a function that will be called when a top-level wait on the application is required(most probably to display the wait spinner)
 * @fucntion
 * @param {function} setWaitF - Function to be called when the wait is required
 * @return {void}
 */
export const setGlobalWait = (setWaitF) => {
  maximoplus.core.globalFunctions.globalDisplayWaitCursor = setWaitF;
};

/**
 * Sets a function that will be called when a top-level wait on the application is no longer required(most probably to remove the wait spinner)
 * @fucntion
 * @param {function} removeWaitF - Function to be called when the wait is no longer required
 * @return {void}
 */
export const removeGlobalWait = (removeWaitF) => {
  maximoplus.core.globalFunctions.globalRemoveWaitCursor = removeWaitF;
};

/**
 * The server root is the URL of the MaximoPlus server.
 * @fucntion
 * @param {string} SERVER_ROOT - The URL of the MaximoPlus server
 * @return {void}
 */
export const setServerRoot = (SERVER_ROOT) => {
  maximoplus.net.globalFunctions.serverRoot = () => {
    return SERVER_ROOT;
  };
};

/**
 * Login to Maximo
 * @function
 * @param {string} username
 * @param {string} password
 * @param {noErrorCallback}  callbackF - The function to be called upon successful login
 * @param {errorCallback}  errbackF - The function to be called upon login error
 * @return {void}
 */
export const maxLogin = (username, password, callbackF, errbackF) => {
  maximoplus.core.max_login(username, password, callbackF, errbackF);
};

/**
 * The callback function is called when the user is logged off from Maximo
 * Usually, it opens the login dialog
 * @function
 * @param {errorCallback} openLoginDialog - The callback function to be called once the user has been logged off
 */
export const setOnLoggedOff = (openLoginDialog) => {
  maximoplus.core.setOnLoggedOff(openLoginDialog);
};

/**
 * Get SQLite database callback, called by the core library, to get the instance of the SQLite database. Check db.js in React Native template for an example.
 * @callback getSQLDBCallback
 */

/**
 * Sets the SQL database callback
 * @function
 * @param {getSQLDBCallback} getSQLDatabase
 */
export const setSQLDBCallback = (getSQLDatabase) => {
  maximoplus.sqlite.globalFunctions.getSQLDatabase = getSQLDatabase;
};

/**
 * Prepare empty datbase. Usually used to run the script to load the file.
 * Native apps can use setSQLDBCallback to get full DB without script
 * @callback prepareDBCallback
 * @param db - empty Sqlite database
 */

/**
 * Prepare the empty db. Usually runs the script
 * @function
 * @param {prepareDBCallback} getPrepareSQLDB -- the empty sqlite database
 * @return {void}
 **/
export const prepareSQLDB = (getPrepareSQLDB) => {
  maximoplus.sqlite.globalFunctions.prepareDatabase = getPrepareSQLDB;
};
/**
 * Sets an application state Online or Offline. Useful for the testing, and automated in the template.
 * @function
 * @param {boolean} offline - if true, sets the application offline; otherwise, bring it back online
 * @return {void}
 */
export const setOffline = (offline) => {
  maximoplus.core.setOffline(offline);
};

/**
 * Offline error for one record
 * @typedef {Object} OfflineError
 * @property {object} data - the offline data record that failed to save to Maximo,
 * @property {string} message - the error message for the offline record that failed to save to Maximo.
 **/

/**
 * @callback offlineErrorsCallback
 * @param{OfflineError[]} errors
 */

/**
 * Set callback for displaying the offline errors.
 * @function
 * @param {offlineErrorsCallback} offlineErrorsCb
 * @return {void}
 */
export const setOfflineErrorsCb = (offlineErrorsCb) => {
  maximoplus.core.globalFunctions.globalOfflinePostError = offlineErrorsCb;
};

export const setOfflineListener = (offlineListener) => {
  maximoplus.offline.globalFunctions.listenOffline = offlineListener;
};

export const setOfflineDetector = (offlineDetector) => {
  maximoplus.offline.globalFunctions.isAppOffline = offlineDetector;
};

const executeSql = (tx, sql) => {
  console.log(sql);
  if (!sql) return Promise.resolve("empty sql");
  return new Promise((resolve, reject) => {
    tx.executeSql(
      sql,
      [],
      () => {
        resolve(true);
      },
      (tx, err) => {
        reject(err);
      }
    );
  });
};
/**
 * Runs the script on the empty database. The script is semicolomn separated string, and db is the empty sqlite database
 * @function
 * @param {object} db  - sqlite database
 * @param {string} script
 */

export const scriptRunner = (db, script) => {
  const statements = Array.isArray(script) ? script : script.split(";");
  return new Promise((resolve, reject) => {
    db.transaction(async (tx) => {
      try {
        for (const statement of statements) {
          await executeSql(tx, statement);
        }
        resolve("done");
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const setOfflineNotifier = (offlineNotifier) => {
  maximoplus.core.setOfflineNotifier(offlineNotifier);
};
