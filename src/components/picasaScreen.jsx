import React from 'react';
import './misc.css';
import '../css/menubar.css'
import '../css/sidebar.css'
import '../css/image_tile.css'
import '../css/login.css'
import '../css/imageModal.css'
import store from 'store';
import { Helmet } from 'react-helmet';
import { Redirect } from 'react-router-dom';

import MenuExampleTabular from './tabular_menu'
import { mapWithConcurrency } from './concurrencyPool';
import FolderSidebar from './folderSidebar'
import PersonSidebar from './personSidebar'
import ImageScreen from './imageScreen'
import axiosInstance from './axios_setup'
import { withRetry } from './apiRetry';
import CircleLoader from "react-spinners/CircleLoader";

// Cap how many pagination requests are in flight at once. 5 is a
// reasonable default — enough to get the concurrency win, low enough
// to not hammer the backend even if the dataset grows a lot.
const PAGINATION_CONCURRENCY = 5;

// Owns the text input's own keystroke-by-keystroke state locally.
// PicasaScreen sits above the (large, ~700+ entry) sidebar list, so if
// the input's value lived in PicasaScreen's state instead, every
// keystroke would re-render that whole sidebar along with it - kept
// this isolated so typing only re-renders this small subtree.
class RenameModal extends React.Component {
  constructor(props){
    super(props);
    this.state = { value: props.initialValue };
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleConfirm = this.handleConfirm.bind(this);
  }

  handleChange(e){
    this.setState({ value: e.target.value });
  }

  handleConfirm(){
    this.props.onSubmit(this.state.value);
  }

  handleKeyDown(e){
    if (e.key === 'Enter') this.handleConfirm();
    if (e.key === 'Escape') this.props.onCancel();
  }

  render(){
    return (
      <div className='Overlay RenameOverlay' onClick={this.props.onCancel}>
        <div className='renameModal' onClick={(e) => e.stopPropagation()}>
          <h3>Rename person</h3>
          <input
            type="text"
            autoFocus
            value={this.state.value}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}
          />
          {this.props.error && (
            <div className='renameModalError'>{this.props.error}</div>
          )}
          <div className='renameModalActions'>
            <button className='renameCancelBtn' onClick={this.props.onCancel}>
              Cancel
            </button>
            <button
              className='renameConfirmBtn'
              disabled={this.props.submitting}
              onClick={this.handleConfirm}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// Same "own its keystroke state locally" reasoning as RenameModal above.
// Reuses the .item/.item:hover styling from image_tile.css (already
// imported by this file) that mutableSelect.jsx's person-search dropdown
// uses, for a consistent look, though this is a plain always-open list
// in a modal rather than an absolutely-positioned dropdown - no
// flip/positioning logic needed here.
class MergeModal extends React.Component {
  constructor(props){
    super(props);
    this.state = { filterValue: '' };
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  handleChange(e){
    this.setState({ filterValue: e.target.value });
  }

  handleKeyDown(e){
    if (e.key === 'Escape') this.props.onCancel();
  }

  render(){
    // Escape regex special characters so a stray "(" etc. in the search
    // box can't throw a SyntaxError out of `new RegExp` and crash the
    // modal - mutableSelect.jsx's equivalent filter doesn't bother with
    // this, but there's no reason not to be safe here.
    const escaped = this.state.filterValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    const options = this.props.people
      .filter(p => p.id !== this.props.sourceId && p.id !== this.props.unassignedId && p.id !== this.props.ignorePersonId)
      .filter(p => p.person_name.match(re));

    return (
      <div className='Overlay RenameOverlay' onClick={this.props.onCancel}>
        <div className='renameModal' onClick={(e) => e.stopPropagation()}>
          <h3>Merge "{this.props.sourceName}" into...</h3>
          {this.props.submitting ? (
            <div>
              Merging {this.props.progress.total > 0 ? `${this.props.progress.done} of ${this.props.progress.total}` : '...'}
            </div>
          ) : (
            <>
              <input
                type="text"
                autoFocus
                placeholder="Search people..."
                value={this.state.filterValue}
                onChange={this.handleChange}
                onKeyDown={this.handleKeyDown}
              />
              <div className='mergeModalList'>
                {options.map(p => (
                  <div
                    key={p.id}
                    className='item'
                    onClick={() => this.props.onSubmit(p.id, p.person_name)}
                  >
                    {p.person_name}
                  </div>
                ))}
              </div>
            </>
          )}
          {this.props.error && (
            <div className='renameModalError'>{this.props.error}</div>
          )}
          <div className='renameModalActions'>
            <button className='renameCancelBtn' disabled={this.props.submitting} onClick={this.props.onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}

class PicasaScreen extends React.Component{
  
  constructor(props) {
    super(props);

    this.state = {
      people : [], 
      folders: [],
      // people_url: store.get('api_url') + '/people/?fields=person_name,url,num_faces,id,num_possibilities&limit=1000',
      people_url: store.get('api_url') + '/person_list/',
      dir_url: store.get('api_url') + '/folder_list/',
      param_url: store.get('api_url') + '/parameters/',
      loading: true,
      names_fetched: false,
      dirs_fetched: false,
      params_fetched: false,
      tab: 'People',
      unlabeled_toggle: false,
      only_unverified_toggle: false,
      face: false,
      total: false,
      t2: false,
      api_id: 0,
      selectedIndex: -100,

      showRenameModal: false,
      renamePersonId: null,
      renameInitialValue: '',
      renameError: '',
      renameSubmitting: false,

      showMergeModal: false,
      mergeSourceId: null,
      mergeSourceName: '',
      mergeError: '',
      mergeSubmitting: false,
      mergeProgress: { done: 0, total: 0 },
    };
          
    // console.log(this.state.param_url)
    axiosInstance.get(this.state.param_url)    
    .then( (response) => {
      // var info = response.data
      var access_key = response.data.random_access_key;

      this.setState({params_fetched: true})
      store.set('access_key', access_key);

      if (this.state.names_fetched && this.state.dirs_fetched){
        this.setState({loading: false})
      }
    })

    this.updatePersonList = this.updatePersonList.bind(this)
    this.updatePersonCounts = this.updatePersonCounts.bind(this)
    this.updatePersonName = this.updatePersonName.bind(this)
    this.fetchPeopleList = this.fetchPeopleList.bind(this)
    this.openRenameModal = this.openRenameModal.bind(this)
    this.closeRenameModal = this.closeRenameModal.bind(this)
    this.submitRename = this.submitRename.bind(this)

    this.openMergeModal = this.openMergeModal.bind(this)
    this.closeMergeModal = this.closeMergeModal.bind(this)
    this.submitMerge = this.submitMerge.bind(this)

  }

  // How often to reconcile locally-bookkept people counts against the
  // backend's actual numbers (e.g. faces sent back to Unassigned get
  // reassigned by someone else in the background over time).
  static PEOPLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;


  compareNames(a, b) {
    // Use toUpperCase() to ignore character casing
    const nameA = a.person_name.toUpperCase();
    const nameB = b.person_name.toUpperCase();

    let comparison = 0;
    if (nameA > nameB) {
      comparison = 1;
    } else if (nameA < nameB) {
      comparison = -1;
    }
    return comparison;
  }

  componentDidMount(){

    function compareDirectories(a, b) {
      // Use toUpperCase() to ignore character casing
      const timeA = a.first_datesec;
      const timeB = b.first_datesec;
      const yearA = a.year;
      const yearB = b.year;

      let comparison = 0;
      if (yearA > yearB) {
        comparison = 1;
      } else if (yearA < yearB) {
        comparison = -1;
      } else if (yearA === yearB){
        if (timeA > timeB) {
          comparison = 1;
        } else if (timeA < timeB) {
          comparison = -1;
        } 
      }
      // Reverse order - multiply by -1
      return comparison * -1;
    }

    // console.debug("Picasa screen mounted")
    var next_url = this.state.people_url;
    while (next_url !== null){
      // console.log(next_url, next_url !== null)
      // let data = this.getNames(next_url);
      // console.log(data)
      next_url = null
      this.fetchPeopleList(true)
      this.compile_api_list(this.state.dir_url, 'folder_aray').then(
        (resp) =>{
          resp.sort(compareDirectories)
          // console.log("Folder length", resp.length)
          for (var i = resp.length - 1; i >= 0; i--){
            if (resp[i].num_images === 0){
              resp.splice(i, 1)
            }
          }
          // console.log("Folder length after: ", resp.length)
          this.setState({'folders': resp})
          this.setState({dirs_fetched: true}); 
          if (this.state.names_fetched && this.state.params_fetched){
            this.setState({loading: false})
          }

          console.log(this.state)
        }
      )
    }

    this.peopleRefreshInterval = setInterval(
      () => this.fetchPeopleList(false),
      PicasaScreen.PEOPLE_REFRESH_INTERVAL_MS
    )
  }

  componentWillUnmount(){
    clearInterval(this.peopleRefreshInterval)
  }

  // Fetch the people list and refresh state.people. On the initial call
  // (isInitial=true) this also does one-time setup: names_fetched/loading
  // flags and locating the special Unassigned/.ignore person ids. Later
  // calls (from the periodic refresh) just reconcile the counts.
  fetchPeopleList(isInitial){
    return this.compile_api_list(this.state.people_url, 'name_array').then(
      (resp) => {
        resp.sort(this.compareNames)
        resp = resp.filter(element => element.num_faces > 0 || element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === ".ignore")
        this.setState({'people': resp})

        if (isInitial){
          this.setState({names_fetched: true});
          this.setState({api_id: resp[0].id})
          console.log("Getting people")
          console.log(resp)
          if (this.state.dirs_fetched && this.state.params_fetched){
            this.setState({loading: false})
          }
          var unassigned_person_id = resp.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned');
          var ignore_person_id = resp.find(element =>element.person_name === ".ignore" );
          console.log(unassigned_person_id)
          console.log(ignore_person_id)
          this.setState({unassigned_id: unassigned_person_id.id})
          this.setState({ignore_person_id: ignore_person_id.id})

          console.log(this.state)
        } else {
          console.log("Reconciled people counts from backend", resp)
        }
      }
    )
  }


////////////////////////////////////////
///  Get all the names or folders, with a linked list.
////////////////////////////////////////
  compile_api_list = async (base_url, state_field) => {
    try {
      const firstPageResp = await this.fetchAPIURL(base_url);
      const firstPageData = firstPageResp.data;
      let data_array = [...firstPageData.results];

      const pageSize = firstPageData.results.length;
      if (!firstPageData.next || pageSize === 0) {
        return data_array;
      }

      const totalPages = Math.ceil(firstPageData.count / pageSize);
      const remainingUrls = [];
      for (let page = 1; page < totalPages; page++) {
        const url = new URL(base_url);
        url.searchParams.set('limit', pageSize);
        url.searchParams.set('offset', page * pageSize);
        remainingUrls.push(url.toString());
      }

      const remainingResponses = await mapWithConcurrency(
        remainingUrls,
        PAGINATION_CONCURRENCY,
        url => this.fetchAPIURL(url)
      );

      for (const resp of remainingResponses) {
        data_array = data_array.concat(resp.data.results);
      }

      return data_array;
    } catch (e) {
      console.log('error', e);
      return [];
    }
  };


  fetchAPIURL = async (url, sort_function) => {

    const names = new Promise((resolve, reject) => {
        axiosInstance.get(url)
        .then( (response) => {
          resolve({data: response.data});
        }
        , (namelist_error) => {
          console.log("CORS ERROR: ", url,  namelist_error)
        }
        )
        .catch(err => {
            console.log(url, err)
        });
    })
           

    return names

    
  }

////////////////////////////////////////
///  END of name fetching
////////////////////////////////////////


////////////////////////////////////////
///  START of callbacks
////////////////////////////////////////


  logoutclick = (childData) => {
    console.log("Logout")
    store.set('loggedIn', false);
    window.location = "/login"
    return <Redirect to="/login" />;
  }

  tabSelectCallback = (childData) => {
    this.setState({tab: childData})
  }
  
  setApiUrl = (childType, childUrl, childId, index) => {
    if (childType === 'folder'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
    }else if (childType === 'person'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
    }
    // console.log(this.state.image_api_id)
  }

  setToggle = (childField) => {
    console.debug( "Child field: ", childField)
    // 'unlabeled_toggle' and 'only_unverified_toggle' are mutually exclusive -
    // turning one on flips the other off. Both can be off at once.
    const exclusiveToggles = ['unlabeled_toggle', 'only_unverified_toggle']
    if (exclusiveToggles.includes(childField)){
      this.setState(prevState => {
        const turningOn = !prevState[childField]
        const next = { [childField]: turningOn }
        if (turningOn){
          for (const other of exclusiveToggles){
            if (other !== childField) next[other] = false
          }
        }
        return next
      })
    }else{
      this.setState(prevState => ({
        [childField] : !prevState[childField]
      }))
    }
  }

////////////////////////////////////////
///  END of callbacks
////////////////////////////////////////

  updatePersonList(person_name, api_key, count){
    count = count || 1
    console.log("Updating person list in PicasaScreen", person_name, api_key, this.state.people)
    var new_object = {'id': api_key,
                      'num_faces' : count,
                      'num_possibilities': 0,
                      'num_unverified_faces': count,
                      'person_name': person_name,
                      'url': store.get('api_url') + '/people/' + api_key + '/'}

    var person_list = this.state.people.concat(new_object)
    person_list.sort(this.compareNames)
    this.setState({people: person_list})

    console.log(new_object)
  }

  // Apply local count deltas to state.people so the sidebar reflects
  // face operations immediately, without waiting on a refetch. deltas is
  // an array of {id, num_faces?, num_possibilities?, num_unverified_faces?}
  // where each present field is a signed delta to add (not an absolute value).
  // Reconciled against the backend periodically by fetchPeopleList.
  updatePersonCounts(deltas){
    if (!deltas || deltas.length === 0) return
    this.setState(prevState => {
      const people = prevState.people.map(person => {
        const delta = deltas.find(d => d.id === person.id)
        if (!delta) return person

        const updated = { ...person }
        for (const field of ['num_faces', 'num_possibilities', 'num_unverified_faces']){
          if (delta[field]){
            updated[field] = Math.max(0, (updated[field] || 0) + delta[field])
          }
        }
        return updated
      })
      return { people }
    })
  }

  // Applies a rename locally so the header and sidebar update
  // immediately, without waiting on a refetch. The sidebar re-sorts by
  // name on every render, so this also fixes list ordering.
  updatePersonName(id, newName){
    this.setState(prevState => ({
      people: prevState.people.map(person =>
        person.id === id ? { ...person, person_name: newName } : person
      )
    }))
  }

  // Shared rename trigger for both the sidebar list buttons
  // (personSidebar.jsx) and the selected person's name in the header
  // (imageScreen.jsx) - lives here since both are siblings under this
  // component and need to open the same modal.
  openRenameModal(id, currentName){
    this.setState({
      showRenameModal: true,
      renamePersonId: id,
      renameInitialValue: currentName,
      renameError: '',
      renameSubmitting: false,
    })
  }

  closeRenameModal(){
    this.setState({ showRenameModal: false, renameError: '', renameSubmitting: false })
  }

  submitRename(rawValue){
    const newName = rawValue.trim()
    if (!newName){
      this.setState({ renameError: 'Name cannot be empty.' })
      return
    }

    const id_num = this.state.renamePersonId
    const rename_url = store.get('api_url') + '/people/' + id_num + '/rename/'

    this.setState({ renameSubmitting: true, renameError: '' })

    withRetry(() => axiosInstance.put(rename_url, { person_name: newName }))
      .then(response => {
        this.updatePersonName(id_num, newName)
        this.setState({ showRenameModal: false, renameSubmitting: false })
      })
      .catch(error => {
        const backendError = error.response && error.response.data && error.response.data.error
        this.setState({
          renameSubmitting: false,
          renameError: backendError || "Couldn't rename — please try again.",
        })
      })
  }

  // Shared merge trigger, same reasoning as openRenameModal above.
  // Refuses to open on the two special people (Unassigned/.ignore) -
  // "merge all their faces into someone else" doesn't make sense for
  // either of those buckets.
  openMergeModal(id, currentName){
    if (id === this.state.unassigned_id || id === this.state.ignore_person_id) return
    this.setState({
      showMergeModal: true,
      mergeSourceId: id,
      mergeSourceName: currentName,
      mergeError: '',
      mergeSubmitting: false,
      mergeProgress: { done: 0, total: 0 },
    })
  }

  closeMergeModal(){
    // Don't let the modal be dismissed mid-merge - there's no cancel
    // for in-flight PATCH requests, and closing would just orphan the
    // progress state with no way to tell if it finished.
    if (this.state.mergeSubmitting) return
    this.setState({ showMergeModal: false, mergeError: '' })
  }

  // There's no bulk person-merge endpoint on the backend - this reassigns
  // every one of the source person's already-declared faces to the
  // target, one PATCH per face (same call mutableSelect.jsx's
  // "send to other person" uses for a single face), concurrency-capped
  // the same way picasaScreen's own pagination fetches are. Doesn't touch
  // the source's unconfirmed/possible matches (num_possibilities) -
  // those are just proposed guesses, not actually the source person's
  // faces yet, so silently confirming them onto the target as part of a
  // merge would be presumptuous.
  //
  // TODO (blocked on backend): the actually-wanted behavior is to also
  // reassign the source's possible/unconfirmed matches to the target,
  // but *still as possible matches* rather than auto-confirming them -
  // there's no endpoint yet for "repoint a proposed match's candidate
  // person" without confirming it (assign_face_to_person always
  // confirms). Once that endpoint exists: fetch the source's face_poss
  // ids the same way as face_declared below, and reassign them via the
  // new endpoint in a second mapWithConcurrency pass. See CLAUDE.md.
  submitMerge(targetId, targetName){
    const sourceId = this.state.mergeSourceId
    if (targetId === sourceId) return

    this.setState({ mergeSubmitting: true, mergeError: '' })

    const face_list_url = store.get('api_url') + '/paginate_obj_ids/' + sourceId + '/face_declared'

    axiosInstance.get(face_list_url)
      .then(response => {
        const faceIds = response.data.id_list || []
        this.setState({ mergeProgress: { done: 0, total: faceIds.length } })

        if (faceIds.length === 0){
          this.finishMerge(sourceId, targetId)
          return
        }

        let completed = 0
        return mapWithConcurrency(faceIds, PAGINATION_CONCURRENCY, (faceId) => {
          const assign_url = store.get('api_url') + '/faces/' + faceId + '/assign_face_to_person/'
          return withRetry(() => axiosInstance.patch(assign_url, { declared_name_key: targetId }))
            .then(() => {
              completed += 1
              this.setState({ mergeProgress: { done: completed, total: faceIds.length } })
            })
        }).then(() => {
          this.finishMerge(sourceId, targetId)
        })
      })
      .catch(error => {
        console.log("Error in merge", error)
        this.setState({
          mergeSubmitting: false,
          mergeError: "Couldn't complete the merge - some faces may have already moved. Check both people before retrying.",
        })
      })
  }

  // Applies the merge locally (moves the source's face counts onto the
  // target and drops the now-empty source from the sidebar) rather than
  // waiting on a full people-list refetch, same immediacy reasoning as
  // updatePersonCounts/updatePersonName. Safe to remove the source
  // outright here (unlike a generic refetch) since personSidebar.jsx and
  // imageScreen.jsx both now track the selected person by id rather than
  // array position, so the removal can't silently point either at the
  // wrong person.
  //
  // TODO (blocked on backend): this only removes the source from the
  // frontend's list - fetchPeopleList already filters out num_faces===0
  // people (except the two special names) so it won't reappear, but the
  // now-empty person record itself is never actually deleted on the
  // backend and will sit there as an orphan. Needs a delete-person
  // endpoint; once it exists, call it here (or right after the merge
  // completes) instead of/alongside this local-only removal. See
  // CLAUDE.md.
  finishMerge(sourceId, targetId){
    this.setState(prevState => {
      const source = prevState.people.find(p => p.id === sourceId)
      const movedFaces = source ? source.num_faces : 0
      const movedUnverified = source ? source.num_unverified_faces : 0

      const people = prevState.people
        .filter(p => p.id !== sourceId)
        .map(p => p.id === targetId
          ? { ...p, num_faces: p.num_faces + movedFaces, num_unverified_faces: p.num_unverified_faces + movedUnverified }
          : p
        )

      return { people, showMergeModal: false, mergeSubmitting: false }
    })
  }

  renderSidebar() {

    if ( this.state.tab === "Tools" ){
      return <p>Tools</p>
    }
      
    if ( this.state.tab === "People" ){
      return (
      <div>
        <PersonSidebar people={this.state.people} setSource={this.setApiUrl} unlabeled={this.state.unlabeled_toggle} only_unverified={this.state.only_unverified_toggle} onRenamePerson={this.openRenameModal} onMergePerson={this.openMergeModal} />
        <ImageScreen
          tab={this.state.tab}
          api_source={this.state.api_source}
          api_id={this.state.api_id}
          people={this.state.people}
          unassigned_person_id={this.state.unassigned_id}
          ignore_person_id={this.state.ignore_person_id}
          updatePersonList={this.updatePersonList}
          updatePersonCounts={this.updatePersonCounts}
          onRenamePerson={this.openRenameModal}
          unlabeled={this.state.unlabeled_toggle}
          only_unverified={this.state.only_unverified_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }

    if ( this.state.tab === "Folders" ){
      return (
      <div>
        <FolderSidebar folders={this.state.folders} setSource={this.setApiUrl} />
        <ImageScreen 
          tab={this.state.tab} 
          api_source={this.state.api_source} 
          api_id={this.state.api_id} 
          people={this.state.people}
          unlabeled={this.state.unlabeled_toggle}
          only_unverified={this.state.only_unverified_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }
      
    return <p>Unknown state</p>
    
  }

  render() {

    var {history} = this.props;
    return(

      
      <div>

        <Helmet>
          <title>Face Classifier</title>
        </Helmet>

        

        <React.Fragment>
          { this.state.loading ? (
            <div className='spinBackground'>
              <div className="loader">
                <CircleLoader
                // css={override}
                size={250}
                color={"#993333"}
                loading={this.state.loading}
                />
              </div>
              <button className='logoutButton' onClick = {this.logoutclick} >Abort and Logout</button>
            </div>
            ) : (
            <div>
              <MenuExampleTabular
                tabSelectCallback = {this.tabSelectCallback}
                setToggle={this.setToggle}
                onLogout={this.props.onLogout}
                toggleState={{
                  unlabeled_toggle: this.state.unlabeled_toggle,
                  only_unverified_toggle: this.state.only_unverified_toggle,
                  face: this.state.face,
                  total: this.state.total,
                  t2: this.state.t2,
                }}
              />
              <div>
                {this.renderSidebar()}
              </div>

              {this.state.showRenameModal && (
                <RenameModal
                  initialValue={this.state.renameInitialValue}
                  error={this.state.renameError}
                  submitting={this.state.renameSubmitting}
                  onCancel={this.closeRenameModal}
                  onSubmit={this.submitRename}
                />
              )}

              {this.state.showMergeModal && (
                <MergeModal
                  people={this.state.people}
                  sourceId={this.state.mergeSourceId}
                  sourceName={this.state.mergeSourceName}
                  unassignedId={this.state.unassigned_id}
                  ignorePersonId={this.state.ignore_person_id}
                  error={this.state.mergeError}
                  submitting={this.state.mergeSubmitting}
                  progress={this.state.mergeProgress}
                  onCancel={this.closeMergeModal}
                  onSubmit={this.submitMerge}
                />
              )}
            </div>
            )
          }
        </React.Fragment>

      </div>
    );
  }
}


const handleLogout = history => () => {
  console.log("Logging out")
  store.remove('loggedIn');
  // history.push('/login');
  window.location = "/login"
};

export default PicasaScreen;
